'use client';

import { initBrowser, CrashLens } from '@crashlensorg/react';
import type { BrowserInitOptions } from '@crashlensorg/react';

export { CrashLensProvider, ErrorBoundary, withErrorBoundary, useErrorHandler, useCrashLens, useClient } from '@crashlensorg/react';
export type { CrashLensProviderProps, ErrorBoundaryProps } from '@crashlensorg/react';
export type { BrowserInitOptions, CrashOptions, CrashLensUser, Breadcrumb, DeviceInfo, Severity, CaptureParams } from '@crashlensorg/react';

/**
 * Inicializa o SDK no browser (Next.js client).
 * Chame em um componente via <CrashLensProvider> ou diretamente no layout.
 */
export function initNextBrowser(options: BrowserInitOptions): CrashLens {
  const client = initBrowser({
    ...options,
    release: options.release ?? process.env.NEXT_PUBLIC_CRASHLENS_RELEASE ?? process.env.CRASHLENS_RELEASE,
    environment:
      options.environment ?? process.env.NEXT_PUBLIC_CRASHLENS_ENVIRONMENT ?? process.env.NODE_ENV,
  });
  client.setTag('framework', 'nextjs');
  browserClient = client;
  return client;
}

let browserClient: CrashLens | undefined;

/**
 * Captura o erro recebido por `global-error.tsx` / `error.tsx`, registrando `error.digest`.
 * Use dentro de um `useEffect`. Passe o `client` se não usar `initNextBrowser`.
 */
export function captureBoundaryError(
  error: Error & { digest?: string },
  client: CrashLens | undefined = browserClient,
): void {
  try {
    client?.captureException(error, {
      context: 'nextjs-error-boundary',
      handled: true,
      tags: error.digest ? { digest: error.digest } : undefined,
      extra: error.digest ? { digest: error.digest } : undefined,
    });
  } catch {
    // nunca quebra a UI
  }
}