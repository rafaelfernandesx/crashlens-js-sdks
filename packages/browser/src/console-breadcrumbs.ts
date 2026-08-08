import { CrashLens, Severity } from '@crashlensorg/core';

/** Instrumenta console.* para transformar mensagens em breadcrumbs. */
export function instrumentConsoleBreadcrumbs(client: CrashLens): () => void {
  const restore: Array<() => void> = [];

  const names = ['log', 'error', 'warn', 'info', 'debug', 'trace'] as const;
  for (const name of names) {
    const original = console[name]?.bind(console);
    if (!original) continue;
    const level: Severity =
      name === 'error' ? 'error' : name === 'warn' ? 'warning' : name === 'info' ? 'info' : 'debug';

    const wrapped = (...args: unknown[]) => {
      const message = args
        .map((a) => {
          if (a instanceof Error) return a.stack || a.message;
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' ');
      client.addBreadcrumb({
        message: message || level,
        type: 'log',
        category: 'console',
        data: { level, args },
      });
      return original(...args);
    };

    (console as unknown as Record<string, unknown>)[name] = wrapped;
    restore.push(() => {
      (console as unknown as Record<string, unknown>)[name] = original;
    });
  }

  return () => {
    for (const r of restore) r();
  };
}