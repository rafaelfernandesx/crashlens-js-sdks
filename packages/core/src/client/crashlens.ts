import { CrashLensEvent } from '../event';
import { computeEventHash } from '../fingerprint';
import { EventQueue } from '../queue/event-queue';
import { Scope } from '../scope';
import { SessionTracker } from '../session';
import { ITransport } from '../transport/transport';
import { FetchTransport } from '../transport/fetch-transport';
import type { Breadcrumb, CrashLensUser, DeviceInfo, EventHandler, Severity } from '../types';

export interface CrashOptions {
  /** API Key da plataforma (obrigatória). */
  apiKey: string;
  /** URL base da API CrashLens. */
  baseUrl?: string;
  /** Versão da rewrite do app (ex.: "v0.4.0"). */
  release?: string;
  /** Ambiente: "production", "staging", etc. */
  environment?: string;
  /** Versão do runtime (ex.: "v20.11.0"). */
  runtimeVersion?: string;
  /** Nome do runtime: "node", "browser", "flutter". */
  runtime?: string;
  /** Amostragem 0.0–1.0. */
  sampleRate?: number;
  /** Callback para modificar/descartar eventos antes do envio. */
  beforeSend?: EventHandler;
  /** Máximo de breadcrumbs retidos. */
  maxBreadcrumbs?: number;
  /** Intervalo de envio (ms). */
  flushIntervalMs?: number;
  /** Máximo de tentativas de retry. */
  maxRetries?: number;
  /** Timeout HTTP (ms). */
  timeoutMs?: number;
  /** Habilita rastreio de sessões. */
  enableSessionTracking?: boolean;
  /** Intervalo do heartbeat (ms). */
  heartbeatIntervalMs?: number;
  /** Informações do dispositivo/host. */
  deviceInfo?: DeviceInfo;
  /** Transporte customizado. */
  transport?: ITransport;
}

export interface CaptureParams {
  message?: string;
  severity?: Severity;
  exceptionType?: string;
  exceptionMessage?: string;
  stackTrace?: string;
  fingerprint?: string;
  context?: string;
  url?: string;
  user?: CrashLensUser;
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  release?: string;
  environment?: string;
  handled?: boolean;
  runtime?: string;
  runtimeVersion?: string;
  error?: unknown;
}

export interface CaptureResult {
  ok: boolean;
  eventId?: string;
  reason?: string;
}

/**
 * Cliente principal do CrashLens SDK (runtime-agnóstico).
 * Espelha a API do SDK Flutter: capture*, breadcrumbs, user, tags, beforeSend,
 * fila com retry/batch, sessão e pausa por quota (402/429).
 */
export class CrashLens {
  private readonly opts: CrashOptions;
  private readonly scope = new Scope({ maxBreadcrumbs: 100 });
  private _queue?: EventQueue;
  private _transport?: ITransport;
  private _session?: SessionTracker;
  private _initialized = false;
  private _keyValid = true;
  private _paused = false;
  private deviceInfo?: DeviceInfo;

  constructor(options: CrashOptions) {
    if (!options.apiKey) {
      throw new Error('[CrashLens] apiKey é obrigatória.');
    }
    this.opts = {
      ...options,
      baseUrl: options.baseUrl ?? 'https://apicrashlens.laziv.com/api',
      sampleRate: options.sampleRate ?? 1,
      flushIntervalMs: options.flushIntervalMs ?? 5000,
      maxRetries: options.maxRetries ?? 3,
      timeoutMs: options.timeoutMs ?? 15000,
      enableSessionTracking: options.enableSessionTracking ?? true,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 30000,
      maxBreadcrumbs: options.maxBreadcrumbs ?? 100,
    };
    this.scope.maxBreadcrumbs = this.opts.maxBreadcrumbs!;
    this.deviceInfo = options.deviceInfo;
  }

  /** Inicializa o SDK: valida a chave, configura fila e inicia a sessão. */
  async init(): Promise<void> {
    this._transport =
      this.opts.transport ??
      new FetchTransport({
        baseUrl: this.opts.baseUrl!,
        apiKey: this.opts.apiKey,
        timeoutMs: this.opts.timeoutMs,
      });

    this._keyValid = await this._transport.validateApiKey();
    if (!this._keyValid) {
      this._initialized = true;
      return;
    }

    this._queue = new EventQueue({
      transport: this._transport,
      maxRetries: this.opts.maxRetries,
      flushIntervalMs: this.opts.flushIntervalMs,
      onQuotaExceeded: () => this.pause('limite de plano atingido'),
    });
    this._queue.startAutoFlush();

    if (this.opts.enableSessionTracking) {
      await this._startSession();
    }

    this._initialized = true;
  }

  private async _startSession(): Promise<void> {
    this._session = new SessionTracker({
      transport: this._transport!,
      release: this.opts.release,
      platform: this.opts.runtime,
      environment: this.opts.environment,
      deviceId: this.deviceInfo?.deviceId,
      deviceModel: this.deviceInfo?.deviceModel,
      deviceManufacturer: this.deviceInfo?.deviceManufacturer,
      deviceOs: this.deviceInfo?.deviceOs,
      deviceOsVersion: this.deviceInfo?.osVersion,
      locale: this.deviceInfo?.locale,
      platformInfo: this.deviceInfo?.platformInfo,
    });
    await this._session.start();
    this._session.startHeartbeat(this.opts.heartbeatIntervalMs);
    this.scope.setSessionId(this._session.sessionId);
  }

  // ── Captura ──

  captureException(error: unknown, params: CaptureParams = {}): CaptureResult {
    const isErr = error instanceof Error;
    const event = new CrashLensEvent({
      apiKey: this.opts.apiKey,
      message: params.message ?? (isErr ? error.message : String(error)),
      severity: params.severity ?? 'error',
      exceptionType: params.exceptionType ?? (isErr ? error.constructor.name : typeof error),
      exceptionMessage: params.exceptionMessage ?? (isErr ? error.message : String(error)),
      stackTrace: params.stackTrace ?? (isErr ? (error.stack ?? undefined) : undefined),
      release: params.release ?? this.opts.release,
      environment: params.environment ?? this.opts.environment,
      context: params.context,
      url: params.url,
      user: params.user ?? this.scope.user,
      tags: { ...this.scope.tags, ...params.tags },
      extra: { ...this.scope.extra, ...params.extra },
      breadcrumbs: [...this.scope.breadcrumbs],
      deviceInfo: this.deviceInfo,
      handled: params.handled ?? true,
      sessionId: this.scope.sessionId,
      runtime: params.runtime ?? this.opts.runtime,
      runtimeVersion: params.runtimeVersion ?? this.opts.runtimeVersion,
      error,
    });
    return this._capture(event);
  }

  captureMessage(message: string, params: CaptureParams = {}): CaptureResult {
    return this._capture(
      new CrashLensEvent({
        apiKey: this.opts.apiKey,
        message,
        severity: params.severity ?? 'info',
        exceptionType: params.exceptionType,
        exceptionMessage: params.exceptionMessage,
        stackTrace: params.stackTrace,
        release: params.release ?? this.opts.release,
        environment: params.environment ?? this.opts.environment,
        context: params.context,
        url: params.url,
        user: params.user ?? this.scope.user,
        tags: { ...this.scope.tags, ...params.tags },
        extra: { ...this.scope.extra, ...params.extra },
        breadcrumbs: [...this.scope.breadcrumbs],
        deviceInfo: this.deviceInfo,
        handled: params.handled ?? true,
        sessionId: this.scope.sessionId,
        runtime: params.runtime ?? this.opts.runtime,
        runtimeVersion: params.runtimeVersion ?? this.opts.runtimeVersion,
      }),
    );
  }

  captureEvent(params: CaptureParams = {}): CaptureResult {
    return this._capture(
      new CrashLensEvent({
        apiKey: this.opts.apiKey,
        message: params.message ?? 'crashlens event',
        severity: params.severity ?? 'info',
        exceptionType: params.exceptionType,
        exceptionMessage: params.exceptionMessage,
        stackTrace: params.stackTrace,
        fingerprint: params.fingerprint,
        release: params.release ?? this.opts.release,
        environment: params.environment ?? this.opts.environment,
        context: params.context,
        url: params.url,
        user: params.user ?? this.scope.user,
        tags: { ...this.scope.tags, ...params.tags },
        extra: { ...this.scope.extra, ...params.extra },
        breadcrumbs: [...this.scope.breadcrumbs],
        deviceInfo: this.deviceInfo,
        handled: params.handled ?? true,
        sessionId: this.scope.sessionId,
        runtime: params.runtime ?? this.opts.runtime,
        runtimeVersion: params.runtimeVersion ?? this.opts.runtimeVersion,
      }),
    );
  }

  private _capture(event: CrashLensEvent): CaptureResult {
    if (this._paused) return { ok: false, reason: 'paused' };
    if (this._keyValid === false) return { ok: false, reason: 'invalid-key' };
    if (Math.random() > (this.opts.sampleRate ?? 1)) return { ok: false, reason: 'sampled-out' };

    if (this.opts.beforeSend) {
      try {
        const result = this.opts.beforeSend(event);
        if (result === null) return { ok: false, reason: 'dropped-by-beforeSend' };
        event = result;
      } catch {
        // ignora erro do beforeSend
      }
    }

    if (event.fingerprint == null) {
      event = event.copyWith({ fingerprint: computeEventHash(event) });
    }
    if (event.severity === 'fatal' || !event.handled) {
      this._session?.markCrashed();
    }

    const id = event.eventId;
    this._queue?.enqueue(event);
    return { ok: Boolean(this._queue), eventId: id };
  }

  // ── Escopo ──

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    this.scope.addBreadcrumb(breadcrumb);
  }

  setUser(user: CrashLensUser | null): void {
    this.scope.setUser(user);
  }

  setTag(key: string, value: unknown): void {
    this.scope.setTag(key, value);
  }

  removeTag(key: string): void {
    this.scope.removeTag(key);
  }

  setExtra(key: string, value: unknown): void {
    this.scope.setExtra(key, value);
  }

  // ── Sessão ──

  get sessionId(): string | undefined {
    return this.scope.sessionId;
  }

  async endSession(): Promise<void> {
    await this._session?.end();
    this.scope.setSessionId(undefined);
  }

  markSessionCrashed(): void {
    this._session?.markCrashed();
  }

  // ── Controle ──

  pause(reason?: string): void {
    this._paused = true;
    this._queue?.pause();
    if (typeof console !== 'undefined') {
      console.debug('[CrashLens] SDK pausado' + (reason ? `: ${reason}` : ''));
    }
  }

  resume(): void {
    this._paused = false;
    this._queue?.resume();
  }

  setDeviceInfo(deviceInfo: DeviceInfo): void {
    this.deviceInfo = deviceInfo;
  }

  get isPaused(): boolean {
    return this._paused;
  }

  get isKeyValid(): boolean {
    return this._keyValid;
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  get pendingEvents(): number {
    return this._queue?.pendingCount ?? 0;
  }

  async flush(): Promise<void> {
    await this._queue?.flush();
  }

  async close(): Promise<void> {
    await this._queue?.flush();
    this._queue?.dispose();
    await this._session?.end();
    this._initialized = false;
  }
}

/** Instância global única (padrão de uso estilo Flutter). */
let defaultClient: CrashLens | undefined;

export async function init(options: CrashOptions): Promise<CrashLens> {
  const client = new CrashLens(options);
  await client.init();
  defaultClient = client;
  return client;
}

export const getDefaultClient = (): CrashLens | undefined => defaultClient;
