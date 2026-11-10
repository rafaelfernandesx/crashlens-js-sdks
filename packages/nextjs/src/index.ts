/** Configuração do Next.js (type estrutural para não depender da versão do Next). */
export type NextConfigLike = Record<string, unknown>;

export interface WithCrashLensOptions {
  /** Desabilita a injeção automática de instrumentação. */
  disableInstrumentation?: boolean;
}

/**
 * Envolve a configuração do Next.js (opcional).
 * Uso: module.exports = withCrashLens({ reactStrictMode: true });
 */
export function withCrashLens(config: NextConfigLike = {}, _options: WithCrashLensOptions = {}): NextConfigLike {
  return {
    ...config,
    // preparado para futuras injeções de webpack/bundler
  };
}

export { initNextServer, captureRequestError } from './server';
export type { NextServerOptions, NextRequestErrorRequest, NextRequestErrorContext } from './server';

export {
  initNextBrowser,
  captureBoundaryError,
  CrashLensProvider,
  ErrorBoundary,
  withErrorBoundary,
  useErrorHandler,
} from './browser';
export type { BrowserInitOptions } from './browser';