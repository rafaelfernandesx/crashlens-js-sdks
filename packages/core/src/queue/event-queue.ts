import type { CrashLensEvent } from '../event';
import { isOk, ITransport } from '../transport/transport';

export interface EventQueueOptions {
  transport: ITransport;
  maxRetries?: number;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  onQuotaExceeded?: () => void;
  onBatchSent?: (events: CrashLensEvent[]) => void;
  beforeEnqueue?: (event: CrashLensEvent) => CrashLensEvent | null;
}

interface PendingEvent {
  event: CrashLensEvent;
  attempts: number;
}

/**
 * Fila de eventos com envio em lote, retry automático e pausa por quota (402/429).
 * Espelha a EventQueue do SDK Flutter.
 */
export class EventQueue {
  private readonly queue: PendingEvent[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private flushing = false;
  private paused = false;
  private closed = false;

  private readonly transport: ITransport;
  private readonly maxRetries: number;
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly onQuotaExceeded?: () => void;
  private readonly onBatchSent?: (events: CrashLensEvent[]) => void;
  private readonly beforeEnqueue?: (event: CrashLensEvent) => CrashLensEvent | null;

  constructor(opts: EventQueueOptions) {
    this.transport = opts.transport;
    this.maxRetries = opts.maxRetries ?? 3;
    this.flushIntervalMs = opts.flushIntervalMs ?? 5000;
    this.maxBatchSize = opts.maxBatchSize ?? 25;
    this.onQuotaExceeded = opts.onQuotaExceeded;
    this.onBatchSent = opts.onBatchSent;
    this.beforeEnqueue = opts.beforeEnqueue;
  }

  enqueue(event: CrashLensEvent): void {
    if (this.closed || this.paused) return;
    const processed = this.beforeEnqueue ? this.beforeEnqueue(event) : event;
    if (!processed) return;
    this.queue.push({ event: processed, attempts: 0 });
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
    if (this.flushing || this.paused || this.closed) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0 && !this.paused) {
        const batch = this.queue.splice(0, this.maxBatchSize);
        const ok = await this.sendBatch(batch);
        if (!ok) {
          // devolve para a fila (respeitando maxRetries)
          this.queue.unshift(...batch);
          break;
        }
        if (this.onBatchSent) this.onBatchSent(batch.map((p) => p.event));
      }
    } finally {
      this.flushing = false;
    }
  }

  private async sendBatch(pending: PendingEvent[]): Promise<boolean> {
    const res = await this.transport.sendBatch(pending.map((p) => p.event));
    if (isOk(res)) return true;

    if (res.status === 402 || res.status === 429) {
      this.paused = true;
      if (this.onQuotaExceeded) this.onQuotaExceeded();
      return false;
    }

    // tenta reenvio individual com retry
    const failed: PendingEvent[] = [];
    for (const item of pending) {
      if (item.attempts >= this.maxRetries) continue; // descarta
      const single = await this.transport.sendEvent(item.event);
      if (isOk(single)) continue;
      if (single.status === 402 || single.status === 429) {
        this.paused = true;
        if (this.onQuotaExceeded) this.onQuotaExceeded();
        return false;
      }
      item.attempts += 1;
      failed.push(item);
    }
    this.queue.unshift(...failed);
    return failed.length === 0;
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