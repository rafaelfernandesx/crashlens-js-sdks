import { initBrowser, CrashLens } from '@crashlens/react';
import type { BrowserInitOptions } from '@crashlens/react';

export { CrashLensProvider, ErrorBoundary, withErrorBoundary, useErrorHandler, useCrashLens, useClient } from '@crashlens/react';
export type { CrashLensProviderProps, ErrorBoundaryProps } from '@crashlens/react';
export type { BrowserInitOptions, CrashOptions, CrashLensUser, Breadcrumb, DeviceInfo, Severity, CaptureParams } from '@crashlens/react';

/**
 * Inicializa o SDK no browser (Next.js client).
 * Chame em um componente via <CrashLensProvider> ou diretamente no layout.
 */
export function initNextBrowser(options: BrowserInitOptions): CrashLens {
  const client = initBrowser(options);
  client.setTag('framework', 'nextjs');
  return client;
}