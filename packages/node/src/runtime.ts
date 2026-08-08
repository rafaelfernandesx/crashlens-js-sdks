import { CrashLens, CrashOptions, DeviceInfo } from '@crashlens/core';
import os from 'node:os';

/**
 * Coleta informações do host Node.js para enriquecer os eventos.
 * O "deviceId" é o hostname (identifica a instância/servidor).
 */
export function collectRuntimeInfo(): DeviceInfo {
  const hostname = os.hostname();
  const platform = process.platform;
  const arch = process.arch;

  return {
    deviceId: hostname || undefined,
    deviceName: hostname || undefined,
    deviceModel: hostname || undefined,
    deviceManufacturer: 'nodejs',
    deviceOs: platform,
    osVersion: os.release(),
    deviceType: 'server',
    cpuArchitecture: arch,
    totalMemoryMb: Math.floor(os.totalmem() / 1024 / 1024),
    locale: process.env.LANG,
  };
}

export interface NodeInitOptions extends CrashOptions {
  /** Captura uncaughtException / unhandledRejection automaticamente (padrão: true). */
  enableGlobalHandlers?: boolean;
  /** Coleta info do host/runtime automaticamente (padrão: true). */
  collectRuntimeInfo?: boolean;
}

export function initNode(options: NodeInitOptions): CrashLens {
  const deviceInfo = options.deviceInfo ?? (options.collectRuntimeInfo === false ? undefined : collectRuntimeInfo());
  const client = new CrashLens({
    ...options,
    runtime: options.runtime ?? 'node',
    runtimeVersion: options.runtimeVersion ?? process.version,
    deviceInfo,
    enableSessionTracking: options.enableSessionTracking ?? false,
  });

  if (options.enableGlobalHandlers !== false) {
    installGlobalErrorHandlers(client);
  }

  void client.init();
  return client;
}

/** Registra listeners para uncaughtException e unhandledRejection. */
export function installGlobalErrorHandlers(client: CrashLens): void {
  process.on('uncaughtException', (error) => {
    client.captureException(error, { handled: false, context: 'uncaughtException' });
  });
  process.on('unhandledRejection', (reason) => {
    client.captureException(reason, { handled: false, context: 'unhandledRejection' });
  });
}

export { CrashLens };
export type { CrashOptions, DeviceInfo, CrashLensUser, Breadcrumb } from '@crashlens/core';