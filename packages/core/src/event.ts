import type { Breadcrumb, CaptureOptions, CrashLensUser, DeviceInfo, IngestPayload, Severity } from './types';
import { uuidv4 } from './utils/nanoid';

export class CrashLensEvent {
  eventId: string;
  apiKey: string;
  message: string;
  severity: Severity;
  exceptionType?: string;
  exceptionMessage?: string;
  stackTrace?: string;
  fingerprint?: string;
  release?: string;
  context?: string;
  url?: string;
  user?: CrashLensUser;
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  breadcrumbs: Breadcrumb[];
  deviceInfo?: DeviceInfo;
  environment?: string;
  handled: boolean;
  sessionId?: string;
  runtime?: string;
  runtimeVersion?: string;
  timestamp: string;

  /** Objeto de erro original (não serializado) — útil em beforeSend. */
  error?: unknown;

  constructor(opts: {
    apiKey: string;
    message: string;
    severity?: Severity;
    exceptionType?: string;
    exceptionMessage?: string;
    stackTrace?: string;
    fingerprint?: string;
    release?: string;
    context?: string;
    url?: string;
    user?: CrashLensUser;
    tags?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    breadcrumbs?: Breadcrumb[];
    deviceInfo?: DeviceInfo;
    environment?: string;
    handled?: boolean;
    sessionId?: string;
    runtime?: string;
    runtimeVersion?: string;
    timestamp?: string;
    error?: unknown;
    eventId?: string;
  }) {
    this.apiKey = opts.apiKey;
    this.message = opts.message;
    this.severity = opts.severity ?? 'error';
    this.exceptionType = opts.exceptionType;
    this.exceptionMessage = opts.exceptionMessage;
    this.stackTrace = opts.stackTrace;
    this.fingerprint = opts.fingerprint;
    this.release = opts.release;
    this.context = opts.context;
    this.url = opts.url;
    this.user = opts.user;
    this.tags = opts.tags;
    this.extra = opts.extra;
    this.breadcrumbs = opts.breadcrumbs ?? [];
    this.deviceInfo = opts.deviceInfo;
    this.environment = opts.environment;
    this.handled = opts.handled ?? true;
    this.sessionId = opts.sessionId;
    this.runtime = opts.runtime;
    this.runtimeVersion = opts.runtimeVersion;
    this.timestamp = opts.timestamp ?? new Date().toISOString();
    this.error = opts.error;
    this.eventId = opts.eventId ?? uuidv4();
  }

  copyWith(overrides: Partial<CrashLensEvent>): CrashLensEvent {
    return new CrashLensEvent({
      apiKey: overrides.apiKey ?? this.apiKey,
      message: overrides.message ?? this.message,
      severity: overrides.severity ?? this.severity,
      exceptionType: overrides.exceptionType ?? this.exceptionType,
      exceptionMessage: overrides.exceptionMessage ?? this.exceptionMessage,
      stackTrace: overrides.stackTrace ?? this.stackTrace,
      fingerprint: overrides.fingerprint ?? this.fingerprint,
      release: overrides.release ?? this.release,
      context: overrides.context ?? this.context,
      url: overrides.url ?? this.url,
      user: overrides.user ?? this.user,
      tags: overrides.tags ?? this.tags,
      extra: overrides.extra ?? this.extra,
      breadcrumbs: overrides.breadcrumbs ?? this.breadcrumbs,
      deviceInfo: overrides.deviceInfo ?? this.deviceInfo,
      environment: overrides.environment ?? this.environment,
      handled: overrides.handled ?? this.handled,
      sessionId: overrides.sessionId ?? this.sessionId,
      runtime: overrides.runtime ?? this.runtime,
      runtimeVersion: overrides.runtimeVersion ?? this.runtimeVersion,
      timestamp: overrides.timestamp ?? this.timestamp,
      error: overrides.error ?? this.error,
      eventId: overrides.eventId ?? this.eventId,
    });
  }

  toJson(): IngestPayload {
    const payload: IngestPayload = {
      message: this.message,
      severity: this.severity,
      handled: this.handled,
      timestamp: this.timestamp,
      sessionId: this.sessionId,
      runtime: this.runtime,
      runtimeVersion: this.runtimeVersion,
    };
    if (this.exceptionType !== undefined) payload.exceptionType = this.exceptionType;
    if (this.exceptionMessage !== undefined) payload.exceptionMessage = this.exceptionMessage;
    if (this.stackTrace !== undefined) payload.stackTrace = this.stackTrace;
    if (this.fingerprint !== undefined) payload.fingerprint = this.fingerprint;
    if (this.release !== undefined) payload.release = this.release;
    if (this.context !== undefined) payload.context = this.context;
    if (this.url !== undefined) payload.url = this.url;
    if (this.user !== undefined) payload.user = this.user;
    if (this.tags !== undefined && Object.keys(this.tags).length > 0) payload.tags = this.tags;
    if (this.extra !== undefined && Object.keys(this.extra).length > 0) payload.extra = this.extra;
    if (this.breadcrumbs.length > 0) payload.breadcrumbs = this.breadcrumbs;
    if (this.deviceInfo !== undefined) payload.deviceInfo = this.deviceInfo;
    if (this.environment !== undefined) payload.environment = this.environment;
    return payload;
  }
}

/** Gera um fingerprint baseado em options usadas para captura. */
export function optionsToEvent(
  base: CaptureOptions & { apiKey: string; message: string },
  sessionId?: string,
  runtime?: string,
  runtimeVersion?: string,
  deviceInfo?: DeviceInfo,
): CrashLensEvent {
  return new CrashLensEvent({
    apiKey: base.apiKey,
    message: base.message,
    severity: 'error',
    exceptionType: base.exceptionType,
    exceptionMessage: base.exceptionMessage,
    stackTrace: base.stackTrace,
    fingerprint: base.fingerprint,
    release: base.release,
    context: base.context,
    url: base.url,
    user: base.user,
    tags: base.tags,
    extra: base.extra,
    handled: base.handled ?? true,
    environment: base.environment,
    sessionId,
    runtime,
    runtimeVersion,
    deviceInfo,
  });
}