import { CrashLens, CrashOptions, DeviceInfo } from '@crashlensorg/core';
import os from 'node:os';
import { asyncLocalScopeProvider } from './scope-context';

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
    scopeProvider: options.scopeProvider ?? asyncLocalScopeProvider,
    enableSessionTracking: options.enableSessionTracking ?? false,
  });

  if (options.enableGlobalHandlers !== false) {
    installGlobalErrorHandlers(client);
  }

  void client.init();
  return client;
}

const FLUSH_TIMEOUT_MS = 2000;

/** Aguarda o flush da fila, desistindo após `timeoutMs`. */
async function flushWithTimeout(client: CrashLens, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.flush().catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Registra listeners para uncaughtException e unhandledRejection.
 * Em uncaughtException: captura, faz flush (até ~2s) e encerra com exit(1) — a menos que
 * existam outros listeners de uncaughtException (preserva a semântica do Node).
 * Também faz flush best-effort em beforeExit e SIGTERM.
 */
export function installGlobalErrorHandlers(client: CrashLens): void {
  const onUncaught = (error: Error): void => {
    client.captureException(error, { handled: false, context: 'uncaughtException' });
    // outros listeners assumem a decisão de encerrar (ou não) o processo
    const others = process.listeners('uncaughtException').filter((l) => l !== onUncaught);
    void flushWithTimeout(client, FLUSH_TIMEOUT_MS).then(() => {
      if (others.length === 0) process.exit(1);
    });
  };
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', (reason) => {
    client.captureException(reason, { handled: false, context: 'unhandledRejection' });
  });
  process.on('beforeExit', () => {
    void flushWithTimeout(client, FLUSH_TIMEOUT_MS);
  });
  const onSigterm = (): void => {
    // ao registrar um listener de SIGTERM o Node deixa de encerrar sozinho:
    // se não houver outros listeners, encerramos após o flush.
    const others = process.listeners('SIGTERM').filter((l) => l !== onSigterm);
    void flushWithTimeout(client, FLUSH_TIMEOUT_MS).then(() => {
      if (others.length === 0) process.exit(143);
    });
  };
  process.on('SIGTERM', onSigterm);
}

export { CrashLens };
export type { CrashOptions, DeviceInfo, CrashLensUser, Breadcrumb } from '@crashlensorg/core';