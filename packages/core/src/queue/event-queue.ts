import type { CrashLensEvent } from '../event';
import { isOk, ITransport, TResponse } from '../transport/transport';
import { byteLength, LIMITS } from '../utils/limits';

export interface EventQueueOptions {
  transport: ITransport;
  maxRetries?: number;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  /** Tamanho máximo (bytes serializados) de um lote. */
  maxBatchBytes?: number;
  /** Máximo de eventos retidos na fila; ao estourar, descarta os mais antigos. */
  maxQueueSize?: number;
  /** Quando retorna false, a fila apenas armazena (ex.: chave ainda não validada). */
  canSend?: () => boolean;
  onQuotaExceeded?: () => void;
  onBatchSent?: (events: CrashLensEvent[]) => void;
  beforeEnqueue?: (event: CrashLensEvent) => CrashLensEvent | null;
}

interface PendingEvent {
  event: CrashLensEvent;
  attempts: number;
  bytes: number;
}

/** Status HTTP de erro do cliente: o evento nunca será aceito, então é descartado. */
const DROP_STATUS = [400, 413, 422];
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60_000;
const RETRY_AFTER_MAX_MS = 5 * 60_000;

/**
 * Fila de eventos com envio em lote, retry automático e pausa por quota (402).
 * 429 aplica backoff temporário (respeita Retry-After) sem pausar o SDK.
 * Espelha a EventQueue do SDK Flutter.
 */
export class EventQueue {
  private queue: PendingEvent[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private inFlight?: Promise<void>;
  private paused = false;
  private closed = false;
  private backoffUntil = 0;
  private backoffLevel = 0;
  private requeued = false;

  private readonly transport: ITransport;
  private readonly maxRetries: number;
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly maxBatchBytes: number;
  private readonly maxQueueSize: number;
  private readonly canSend?: () => boolean;
  private readonly onQuotaExceeded?: () => void;
  private readonly onBatchSent?: (events: CrashLensEvent[]) => void;
  private readonly beforeEnqueue?: (event: CrashLensEvent) => CrashLensEvent | null;

  constructor(opts: EventQueueOptions) {
    this.transport = opts.transport;
    this.maxRetries = opts.maxRetries ?? 3;
    this.flushIntervalMs = opts.flushIntervalMs ?? 5000;
    this.maxBatchSize = opts.maxBatchSize ?? 25;
    this.maxBatchBytes = opts.maxBatchBytes ?? LIMITS.batchBytes;
    this.maxQueueSize = opts.maxQueueSize ?? 100;
    this.canSend = opts.canSend;
    this.onQuotaExceeded = opts.onQuotaExceeded;
    this.onBatchSent = opts.onBatchSent;
    this.beforeEnqueue = opts.beforeEnqueue;
  }

  enqueue(event: CrashLensEvent): void {
    if (this.closed || this.paused) return;
    const processed = this.beforeEnqueue ? this.beforeEnqueue(event) : event;
    if (!processed) return;
    let bytes = 0;
    try {
      bytes = byteLength(JSON.stringify(processed.toJson()));
    } catch {
      return; // não serializável
    }
    this.queue.push({ event: processed, attempts: 0, bytes });
    this.trim();
  }

  /** Descarta os eventos mais antigos além de maxQueueSize. */
  private trim(): void {
    const excess = this.queue.length - this.maxQueueSize;
    if (excess > 0) this.queue.splice(0, excess);
  }

  startAutoFlush(): void {
    if (this.timer || this.closed) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    // não mantém o processo vivo só por causa da fila
    if (this.timer.unref) this.timer.unref();
  }

  async flush(): Promise<void> {
    // Envio já em andamento (ex.: o disparado ao validar a chave): espera ele terminar em vez de
    // voltar na hora — quem chama flush() antes de encerrar o processo perdia o evento.
    // Depois envia o que entrou na fila nesse meio-tempo.
    if (this.inFlight) {
      await this.inFlight;
      if (this.requeued) return; // falha transitória: fica para o próximo ciclo
      return this.flush();
    }
    if (this.paused || this.closed) return;
    if (this.canSend && !this.canSend()) return;
    if (Date.now() < this.backoffUntil) return;
    this.inFlight = this.drain();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0 && !this.paused && !this.closed && Date.now() >= this.backoffUntil) {
      const batch = this.takeBatch();
      this.requeued = false;
      const sent = await this.processBatch(batch);
      if (sent.length > 0 && this.onBatchSent) this.onBatchSent(sent.map((p) => p.event));
      // itens devolvidos à fila: tenta de novo só no próximo ciclo (evita loop apertado)
      if (this.requeued) break;
    }
  }

  /** Retira da fila um lote limitado por quantidade e por bytes (mínimo 1 evento). */
  private takeBatch(): PendingEvent[] {
    let count = 0;
    let bytes = 0;
    while (count < this.queue.length && count < this.maxBatchSize) {
      const next = this.queue[count].bytes;
      if (count > 0 && bytes + next > this.maxBatchBytes) break;
      bytes += next;
      count++;
    }
    return this.queue.splice(0, count);
  }

  /** Envia o lote e devolve os itens entregues. Itens a repetir voltam à fila uma única vez. */
  private async processBatch(batch: PendingEvent[]): Promise<PendingEvent[]> {
    const res = await this.transport.sendBatch(batch.map((p) => p.event));

    if (isOk(res)) {
      this.backoffLevel = 0;
      const results = parseBatchResults(res);
      if (!results) return batch;
      const delivered: PendingEvent[] = [];
      const retry: PendingEvent[] = [];
      batch.forEach((item, i) => {
        const r = results.get(i);
        if (!r || r.ok) {
          delivered.push(item);
        } else if (isRetryableItemError(r.error) && ++item.attempts < this.maxRetries) {
          retry.push(item);
        } // senão: erro do cliente ou tentativas esgotadas → descarta
      });
      this.requeue(retry);
      return delivered;
    }

    if (this.handleGlobalFailure(res)) {
      this.requeue(batch);
      return [];
    }

    // Falha do lote: reenvio individual
    const delivered: PendingEvent[] = [];
    const retry: PendingEvent[] = [];
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const single = await this.transport.sendEvent(item.event);
      if (isOk(single)) {
        delivered.push(item);
        continue;
      }
      if (this.handleGlobalFailure(single)) {
        // quota/rate limit: este e os restantes voltam sem consumir tentativa
        retry.push(...batch.slice(i));
        break;
      }
      if (DROP_STATUS.includes(single.status)) continue;
      item.attempts += 1;
      if (item.attempts < this.maxRetries) retry.push(item);
    }
    this.requeue(retry);
    return delivered;
  }

  /**
   * 402 → pausa o SDK; 429 → backoff temporário (Retry-After ou exponencial).
   * Retorna true se a falha foi desse tipo (itens devem voltar à fila).
   */
  private handleGlobalFailure(res: TResponse): boolean {
    if (res.status === 402) {
      this.paused = true;
      if (this.onQuotaExceeded) this.onQuotaExceeded();
      return true;
    }
    if (res.status === 429) {
      const retryAfter = !res.ok ? res.retryAfter : undefined;
      const delay =
        retryAfter !== undefined
          ? Math.min(retryAfter * 1000, RETRY_AFTER_MAX_MS)
          : Math.min(BACKOFF_BASE_MS * 2 ** this.backoffLevel, BACKOFF_MAX_MS);
      this.backoffLevel++;
      this.backoffUntil = Date.now() + delay;
      return true;
    }
    return false;
  }

  /** Devolve itens ao início da fila, respeitando o limite. */
  private requeue(items: PendingEvent[]): void {
    if (items.length === 0 || this.closed) return;
    this.queue.unshift(...items);
    this.requeued = true;
    this.trim();
  }

  resume(): void {
    this.paused = false;
    void this.flush();
  }

  pause(): void {
    this.paused = true;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  dispose(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.queue.length = 0;
  }
}

interface ItemResult {
  ok: boolean;
  error?: unknown;
}

/** Lê `{results:[{index, ok, error?}]}` da resposta do lote (se houver). */
function parseBatchResults(res: TResponse): Map<number, ItemResult> | undefined {
  const body = res.body;
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body);
    if (!parsed || !Array.isArray(parsed.results)) return undefined;
    const map = new Map<number, ItemResult>();
    parsed.results.forEach((r: any, pos: number) => {
      if (!r || typeof r !== 'object') return;
      map.set(typeof r.index === 'number' ? r.index : pos, { ok: r.ok !== false, error: r.error });
    });
    return map;
  } catch {
    return undefined;
  }
}

/** Erros de item só são repetidos se parecerem transitórios (5xx/429/timeout); o resto é descartado. */
function isRetryableItemError(error: unknown): boolean {
  let status: number | undefined;
  if (typeof error === 'number') status = error;
  else if (error && typeof error === 'object') {
    const e = error as { status?: unknown; statusCode?: unknown };
    const s = e.status ?? e.statusCode;
    if (typeof s === 'number') status = s;
  }
  if (status !== undefined) return status >= 500 || status === 429 || status === 408;
  if (typeof error === 'string') return /internal|server|timeout|unavailable|temporar|rate/i.test(error);
  return false;
}
