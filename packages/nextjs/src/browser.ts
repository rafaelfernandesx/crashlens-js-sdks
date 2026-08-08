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
  const client = initBrowser(options);
  client.setTag('framework', 'nextjs');
  return client;
}