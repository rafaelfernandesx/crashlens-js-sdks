import { createContext, useContext } from 'react';
import type { BrowserInstance } from '@crashlens/browser';
import { CrashLens } from '@crashlens/browser';

export interface CrashLensContextValue {
  client: BrowserInstance;
}

export const CrashLensContext = createContext<CrashLensContextValue | null>(null);

export function useCrashLens(): CrashLensContextValue {
  const ctx = useContext(CrashLensContext);
  if (!ctx) {
    throw new Error('[CrashLens] useCrashLens deve ser usado dentro de <CrashLensProvider>.');
  }
  return ctx;
}

export function useClient(): CrashLens {
  return useCrashLens().client;
}