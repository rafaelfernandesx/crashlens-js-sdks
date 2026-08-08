import { isOk, ITransport } from './transport/transport';
import { newSessionId } from './scope';

export interface SessionOptions {
  transport: ITransport;
  release?: string;
  platform?: string;
  appVersion?: string;
  buildNumber?: string;
  deviceId?: string;
  deviceModel?: string;
  deviceManufacturer?: string;
  deviceOs?: string;
  deviceOsVersion?: string;
  locale?: string;
  environment?: string;
  platformInfo?: Record<string, unknown>;
}

export interface SessionContext {
  sessionId: string;
  startedAt: string;
  crashed: boolean;
  ended: boolean;
  heartbeatIntervalMs?: number;
}

/**
 * Gerencia a sessão: início/fim, heartbeat periódico e marcação de crash.
 */
export class SessionTracker {
  readonly sessionId: string;
  private readonly transport: ITransport;
  private readonly startedAt: string;
  private readonly info: Omit<SessionOptions, 'transport' | 'apiKey'>;
  crashed = false;
  ended = false;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(opts: SessionOptions) {
    this.transport = opts.transport;
    this.sessionId = newSessionId();
    this.startedAt = new Date().toISOString();
    this.info = {
      release: opts.release,
      platform: opts.platform,
      appVersion: opts.appVersion,
      buildNumber: opts.buildNumber,
      deviceId: opts.deviceId,
      deviceModel: opts.deviceModel,
      deviceManufacturer: opts.deviceManufacturer,
      deviceOs: opts.deviceOs,
      deviceOsVersion: opts.deviceOsVersion,
      locale: opts.locale,
      environment: opts.environment,
      platformInfo: opts.platformInfo,
    };
  }

  async start(): Promise<boolean> {
    const body: Record<string, unknown> = {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      platform: this.info.platform,
      release: this.info.release,
      environment: this.info.environment,
      appVersion: this.info.appVersion,
      buildNumber: this.info.buildNumber,
      deviceId: this.info.deviceId,
      deviceModel: this.info.deviceModel,
      deviceManufacturer: this.info.deviceManufacturer,
      deviceOs: this.info.deviceOs,
      deviceOsVersion: this.info.deviceOsVersion,
      locale: this.info.locale,
      platformInfo: this.info.platformInfo,
    };
    // remove undefined
    const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    const res = await this.transport.sendSessionStart(clean);
    return isOk(res);
  }

  startHeartbeat(intervalMs = 30000): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat();
    }, intervalMs);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  async heartbeat(): Promise<boolean> {
    if (this.ended) return false;
    const res = await this.transport.sendHeartbeat(this.sessionId);
    return isOk(res);
  }

  markCrashed(): void {
    this.crashed = true;
  }

  async end(): Promise<boolean> {
    if (this.ended) return true;
    this.ended = true;
    this.stopHeartbeat();
    const duration = Math.floor((Date.now() - new Date(this.startedAt).getTime()) / 1000);
    const res = await this.transport.sendSessionEnd(this.sessionId, {
      endedAt: new Date().toISOString(),
      crashed: this.crashed,
      duration,
    });
    return isOk(res);
  }
}

export function toSessionContext(session: SessionTracker): SessionContext {
  return {
    sessionId: session.sessionId,
    startedAt: new Date().toISOString(),
    crashed: session.crashed,
    ended: session.ended,
  };
}