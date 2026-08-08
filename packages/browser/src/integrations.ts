import { CrashLens } from '@crashlensorg/core';

interface GlobalHandlersHooks {
  onError: (error: unknown, ctx: Record<string, unknown>) => void;
  onUnhandledRejection: (reason: unknown, ctx: Record<string, unknown>) => void;
}

/**
 * Registra window.onerror e unhandledrejection para capturar erros não tratados.
 * Retorna uma função de limpeza (removeEventListener).
 */
export function installGlobalErrorHandlers(hooks: GlobalHandlersHooks): () => void {
  // SSR / ambientes sem window (ex.: prerender do Next.js): não instrumenta.
  if (typeof window === 'undefined') return () => undefined;

  const onError = (event: ErrorEvent) => {
    let error = event.error;
    if (!(error instanceof Error) && event.message) {
      error = new Error(event.message);
      (error as Error & { colno?: number }).colno = event.colno;
    }
    hooks.onError(error ?? new Error(event.message || 'window.onerror'), {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    hooks.onUnhandledRejection(event.reason ?? event.reason, {});
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

/** Integra os handlers globais ao cliente CrashLens. */
export function initGlobalHandlers(client: CrashLens): () => void {
  return installGlobalErrorHandlers({
    onError: (error, ctx) => {
      client.captureException(error, {
        handled: false,
        context: 'window.onerror',
        tags: { source: 'window.onerror' },
        extra: { ...(ctx as Record<string, unknown>) },
      });
    },
    onUnhandledRejection: (reason, _ctx) => {
      client.captureException(reason, {
        handled: false,
        context: 'unhandledrejection',
        tags: { source: 'unhandledrejection' },
      });
    },
  });
}