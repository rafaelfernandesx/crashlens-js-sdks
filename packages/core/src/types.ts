import type { CrashLensEvent } from './event';

export type Severity = 'fatal' | 'error' | 'warning' | 'info' | 'debug' | 'log';

export type BreadcrumbType = 'navigation' | 'request' | 'process' | 'log' | 'user' | 'ui' | 'custom';

export interface CrashLensUser {
  id?: string;
  username?: string;
  email?: string;
  ip_address?: string;
  name?: string;
  data?: Record<string, unknown>;
}

export interface Breadcrumb {
  message: string;
  type?: BreadcrumbType;
  category?: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}

export interface WebDeviceInfo {
  browserName?: string;
  browserVersion?: string;
  userAgent?: string;
  platform?: string;
  language?: string;
  vendor?: string;
  screenResolution?: string;
}

export interface DeviceInfo {
  deviceId?: string;
  deviceName?: string;
  deviceModel?: string;
  deviceManufacturer?: string;
  /** "android", "ios", "windows", "macos", "linux", "web" */
  deviceOs?: string;
  osVersion?: string;
  deviceType?: string;
  screenResolution?: string;
  locale?: string;
  timezone?: string;
  isPhysicalDevice?: boolean;
  cpuArchitecture?: string;
  totalMemoryMb?: number;
  appVersion?: string;
  buildNumber?: string;
  platformInfo?: {
    web?: WebDeviceInfo;
  };
}

/** Payload exato enviado à API CrashLens (espelha o IngestEventDto do backend). */
export interface IngestPayload {
  /** UUID gerado no cliente (idempotência no servidor). */
  eventId?: string;
  message: string;
  severity?: Severity;
  exceptionType?: string;
  exceptionMessage?: string;
  stackTrace?: string;
  fingerprint?: string;
  context?: string;
  user?: CrashLensUser;
  url?: string;
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  breadcrumbs?: Breadcrumb[];
  deviceInfo?: DeviceInfo;
  release?: string;
  environment?: string;
  handled?: boolean;
  timestamp?: string;
  sessionId?: string;
  runtime?: string;
  runtimeVersion?: string;
}

export interface TransportOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface EventHandler {
  /** Processa (e possivelmente modifica/descarta) um evento antes do envio. */
  (event: CrashLensEvent): CrashLensEvent | null;
}

export interface CaptureOptions {
  handled?: boolean;
  context?: string;
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  exceptionType?: string;
  exceptionMessage?: string;
  stackTrace?: string;
  fingerprint?: string;
  release?: string;
  url?: string;
  environment?: string;
  user?: CrashLensUser;
  runtime?: string;
  runtimeVersion?: string;
}