import { initNode, CrashLens } from '@crashlensorg/node';
import type { NodeInitOptions } from '@crashlensorg/node';

export interface NextServerOptions extends NodeInitOptions {
  /** Nome do runtime (padrão: "nextjs-node"). */
  runtime?: string;
  /** Tag "framework" adicionada aos eventos (padrão: "nextjs"). */
  framework?: string;
}

let serverClient: CrashLens | undefined;

/**
 * Inicializa o SDK no servidor (Node runtime do Next.js).
 * Chame em `instrumentation.ts` → `register()`.
 */
export function initNextServer(options: NextServerOptions): CrashLens {
  serverClient = initNode({
    ...options,
    runtime: options.runtime ?? 'nextjs-node',
  });
  serverClient.setTag('framework', options.framework ?? 'nextjs');
  return serverClient;
}

/** Retorna o cliente do servidor (ou undefined se não inicializado). */
export function getServerClient(): CrashLens | undefined {
  return serverClient;
}

/** Captura uma exceção no servidor (rota de API, server component, etc.). */
export function captureException(error: unknown, params?: Parameters<CrashLens['captureException']>[1]): void {
  serverClient?.captureException(error, params);
}

export { initNode } from '@crashlensorg/node';
export type { NodeInitOptions, CrashOptions, CrashLensUser, Breadcrumb, DeviceInfo, Severity } from '@crashlensorg/node';