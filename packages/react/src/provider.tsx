import { ReactNode, useMemo } from 'react';
import { initBrowser, BrowserInitOptions } from '@crashlensorg/browser';
import { CrashLensContext } from './context';
import type { CrashLensContextValue } from './context';

export interface CrashLensProviderProps extends BrowserInitOptions {
  children: ReactNode;
}

/**
 * Inicializa o SDK e disponibiliza o cliente para toda a árvore.
 * <CrashLensProvider apiKey="cl_live_xxx"><App /></CrashLensProvider>
 */
export function CrashLensProvider({ children, ...options }: CrashLensProviderProps) {
  const value = useMemo<CrashLensContextValue>(() => {
    const client = initBrowser(options);
    return { client };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <CrashLensContext.Provider value={value}>{children}</CrashLensContext.Provider>;
}

export { CrashLensContext };
export type { CrashLensContextValue };