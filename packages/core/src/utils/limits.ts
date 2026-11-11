import type { Breadcrumb } from '../types';

/** Limites de payload aplicados no SDK antes do envio. */
export const LIMITS = {
  message: 8 * 1024,
  stackTrace: 64 * 1024,
  breadcrumbs: 50,
  breadcrumbData: 2 * 1024,
  /** extra / tags / context (serializados). */
  blob: 32 * 1024,
  /** Tamanho máximo (bytes serializados) de um lote. */
  batchBytes: 512 * 1024,
};

const SUFFIX = '…[truncated]';

export function truncateString(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, Math.max(0, max - SUFFIX.length)) + SUFFIX;
}

/** Tamanho em bytes (UTF-8) de uma string. */
export function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  return value.length;
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/** Se o objeto serializado passar de `max`, devolve um marcador com prévia truncada. */
export function capObject<T extends Record<string, unknown>>(value: T, max: number): T | Record<string, unknown> {
  const json = safeStringify(value);
  if (json === undefined) return { _truncated: true };
  if (json.length <= max) return value;
  return { _truncated: true, preview: truncateString(json, Math.min(max, 1024)) };
}

export function capBreadcrumbs(list: Breadcrumb[]): Breadcrumb[] {
  return list.slice(-LIMITS.breadcrumbs).map((b) => {
    if (!b.data) return b;
    const capped = capObject(b.data, LIMITS.breadcrumbData);
    return capped === b.data ? b : { ...b, data: capped };
  });
}
