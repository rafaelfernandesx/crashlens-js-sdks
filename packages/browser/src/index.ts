import { CrashLens, CrashOptions } from '@crashlensorg/core';
import { DeviceInfo } from '@crashlensorg/core';
import { collectBrowserInfo } from './device';
import { initGlobalHandlers } from './integrations';
import { instrumentHttpBreadcrumbs } from './http-breadcrumbs';
import { instrumentConsoleBreadcrumbs } from './console-breadcrumbs';
import { instrumentNavigationBreadcrumbs } from './navigation-breadcrumbs';

export interface BrowserInitOptions extends CrashOptions {
  /** Captura window.onerror/unhandledrejection (padrão: true). */
  enableGlobalHandlers?: boolean;
  /** Breadcrumbs de fetch/XHR (padrão: true). */
  enableHttpBreadcrumbs?: boolean;
  /** Breadcrumbs de console (padrão: true). */
  enableConsoleBreadcrumbs?: boolean;
  /** Breadcrumbs de navegação (padrão: true). */
  enableNavigationBreadcrumbs?: boolean;
  /** Coleta info do browser automaticamente (padrão: true). */
  collectBrowserInfo?: boolean;
  /** Rastreia sessões (padrão: true). */
  enableSessionTracking?: boolean;
}

export interface BrowserInstance extends CrashLens {
  /** Remove listeners e restaura os instrumentos do browser. */
  cleanup(): void;
}

export function initBrowser(options: BrowserInitOptions): BrowserInstance {
  const deviceInfo: DeviceInfo | undefined =
    options.deviceInfo ?? (options.collectBrowserInfo === false ? undefined : collectBrowserInfo());

  const client = new CrashLens({
    ...options,
    runtime: options.runtime ?? 'browser',
    runtimeVersion: options.runtimeVersion,
    deviceInfo,
    enableSessionTracking: options.enableSessionTracking ?? true,
  });

  const cleanups: Array<() => void> = [];
  if (options.enableGlobalHandlers !== false) {
    cleanups.push(initGlobalHandlers(client));
  }
  if (options.enableHttpBreadcrumbs !== false) {
    cleanups.push(instrumentHttpBreadcrumbs(client));
  }
  if (options.enableConsoleBreadcrumbs !== false) {
    cleanups.push(instrumentConsoleBreadcrumbs(client));
  }
  if (options.enableNavigationBreadcrumbs !== false) {
    cleanups.push(instrumentNavigationBreadcrumbs(client));
  }

  void client.init();

  const instance = client as BrowserInstance;
  instance.cleanup = () => {
    for (const c of cleanups) {
      try {
        c();
      } catch {
        // ignora
      }
    }
  };
  return instance;
}

export { CrashLens };
export type { CrashOptions, CrashLensUser, Breadcrumb, DeviceInfo, Severity, CaptureParams } from '@crashlensorg/core';