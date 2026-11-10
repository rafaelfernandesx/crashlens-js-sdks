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
    release: options.release ?? process.env.CRASHLENS_RELEASE ?? process.env.NEXT_PUBLIC_CRASHLENS_RELEASE,
    environment:
      options.environment ??
      process.env.CRASHLENS_ENVIRONMENT ??
      process.env.NEXT_PUBLIC_CRASHLENS_ENVIRONMENT ??
      process.env.NODE_ENV,
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

/** Request recebido por `onRequestError` (type estrutural, independe da versão do Next). */
export interface NextRequestErrorRequest {
  path: string;
  method: string;
  headers?: Record<string, string | string[] | undefined>;
}

/** Contexto recebido por `onRequestError` (type estrutural). */
export interface NextRequestErrorContext {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
  revalidateReason?: string;
}

/**
 * Handler para `onRequestError` do `instrumentation.ts` (Next 15/16).
 * Não envia headers: apenas método, path (sem query) e o request id, se existir.
 *
 *   export const onRequestError = captureRequestError;
 */
export function captureRequestError(
  err: unknown,
  request: NextRequestErrorRequest,
  context: NextRequestErrorContext = {},
): void {
  try {
    if (!serverClient) return;
    const path = String(request?.path ?? '').split(/[?#]/)[0];
    const rawId = request?.headers?.['x-request-id'];
    const requestId = Array.isArray(rawId) ? rawId[0] : rawId;

    const tags: Record<string, unknown> = { httpMethod: request?.method };
    if (context.routePath) tags.routePath = context.routePath;
    if (context.routeType) tags.routeType = context.routeType;
    if (context.routerKind) tags.routerKind = context.routerKind;
    if (requestId) tags.requestId = requestId;

    const extra: Record<string, unknown> = { method: request?.method, path };
    if (context.renderSource) extra.renderSource = context.renderSource;
    if (context.revalidateReason) extra.revalidateReason = context.revalidateReason;
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === 'string') extra.digest = digest;

    serverClient.captureException(err, {
      context: 'nextjs-onRequestError',
      handled: false,
      url: path,
      tags,
      extra,
    });
  } catch {
    // a captura nunca pode quebrar a resposta
  }
}

export { initNode } from '@crashlensorg/node';
export type { NodeInitOptions, CrashOptions, CrashLensUser, Breadcrumb, DeviceInfo, Severity } from '@crashlensorg/node';