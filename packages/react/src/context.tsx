import { createContext, useContext } from 'react';
import type { BrowserInstance } from '@crashlensorg/browser';
import { CrashLens } from '@crashlensorg/browser';

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