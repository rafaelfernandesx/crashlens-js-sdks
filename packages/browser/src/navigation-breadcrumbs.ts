import { CrashLens } from '@crashlensorg/core';

/** Instrumenta pushState/replaceState para gerar breadcrumbs de navegação. */
export function instrumentNavigationBreadcrumbs(client: CrashLens): () => void {
  if (typeof window === 'undefined' || !window.history) return () => undefined;

  const add = (url: string) => {
    client.addBreadcrumb({ message: url, type: 'navigation', category: 'navigation' });
  };

  const originalPush = window.history.pushState.bind(window.history);
  const originalReplace = window.history.replaceState.bind(window.history);

  window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    originalPush(data, unused, url);
    add(window.location.href);
  };

  window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    originalReplace(data, unused, url);
    add(window.location.href);
  };

  return () => {
    window.history.pushState = originalPush;
    window.history.replaceState = originalReplace;
  };
}