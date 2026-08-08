import type { CrashLensEvent } from '../event';

export type TResponse =
  | { ok: true; status: number }
  | { ok: false; status: number; body?: string };

/**
 * Transporte envia eventos/sessões para a API CrashLens.
 * Cada ambiente (browser/node) fornece sua própria implementação de `post`.
 */
export interface ITransport {
  sendEvent(event: CrashLensEvent): Promise<TResponse>;
  sendBatch(events: CrashLensEvent[]): Promise<TResponse>;
  validateApiKey(): Promise<boolean>;
  sendSessionStart(body: Record<string, unknown>): Promise<TResponse>;
  sendSessionEnd(sessionId: string, body: Record<string, unknown>): Promise<TResponse>;
  sendHeartbeat(sessionId: string): Promise<TResponse>;
}

export interface PostFnOpts {
  path: string;
  /** Raw JSON string body. */
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export type PostFn = (opts: PostFnOpts) => Promise<TResponse>;

/** Status HTTP que indicam limite de plano/quota atingido → SDK deve pausar. */
export const QUOTA_STATUS = [402, 429];

export const isOk = (res: TResponse): boolean => res.ok && (res.status === 200 || res.status === 201);

export abstract class BaseTransport implements ITransport {
  protected readonly baseUrl: string;
  protected readonly apiKey: string;
  protected readonly timeoutMs: number;

  /** Flag: plano atingiu o limite → SDK pausa envios. */
  quotaExceeded = false;

  constructor(opts: { baseUrl: string; apiKey: string; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 15000;
  }

  protected abstract post(opts: PostFnOpts): Promise<TResponse>;

  protected headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
  }

  async sendEvent(event: CrashLensEvent): Promise<TResponse> {
    const res = await this.post({
      path: '/events',
      body: JSON.stringify(event.toJson()),
      headers: this.headers(),
      timeoutMs: this.timeoutMs,
    });
    this.refreshQuota(res);
    return res;
  }

  async sendBatch(events: CrashLensEvent[]): Promise<TResponse> {
    if (events.length === 0) return { ok: true, status: 200 };
    const res = await this.post({
      path: '/events/batch',
      body: JSON.stringify(events.map((e) => e.toJson())),
      headers: this.headers(),
      timeoutMs: this.timeoutMs,
    });
    this.refreshQuota(res);
    return res;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const res = await this.post({
        path: '/api-keys/validate',
        body: JSON.stringify({ apiKey: this.apiKey }),
        headers: this.headers(),
        timeoutMs: this.timeoutMs,
      });
      // 402/429 (quota) → a chave ainda é válida; apenas erro 401/403 invalida
      return !(res.ok === false && (res.status === 401 || res.status === 403));
    } catch {
      // timeout/rede — considera válida para não bloquear offline
      return true;
    }
  }

  async sendSessionStart(body: Record<string, unknown>): Promise<TResponse> {
    return this.post({
      path: '/sessions',
      body: JSON.stringify(body),
      headers: this.headers(),
      timeoutMs: this.timeoutMs,
    });
  }

  async sendSessionEnd(sessionId: string, body: Record<string, unknown>): Promise<TResponse> {
    return this.post({
      path: `/sessions/${encodeURIComponent(sessionId)}/end`,
      body: JSON.stringify(body),
      headers: this.headers(),
      timeoutMs: this.timeoutMs,
    });
  }

  async sendHeartbeat(sessionId: string): Promise<TResponse> {
    return this.post({
      path: `/sessions/${encodeURIComponent(sessionId)}/heartbeat`,
      headers: this.headers(),
      timeoutMs: this.timeoutMs,
    });
  }

  protected refreshQuota(res: TResponse): void {
    this.quotaExceeded = QUOTA_STATUS.includes(res.status);
  }
}