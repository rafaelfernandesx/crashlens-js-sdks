export { CrashLensProvider, CrashLensContext } from './provider';
export type { CrashLensProviderProps, CrashLensContextValue } from './provider';
export { ErrorBoundary, withErrorBoundary, useErrorHandler } from './error-boundary';
export type { ErrorBoundaryProps } from './error-boundary';
export { useCrashLens, useClient } from './context';
export { initBrowser } from '@crashlens/browser';
export type { BrowserInitOptions } from '@crashlens/browser';
export { CrashLens } from '@crashlens/browser';
export type { CrashOptions, CrashLensUser, Breadcrumb, DeviceInfo, Severity, CaptureParams } from '@crashlens/browser';