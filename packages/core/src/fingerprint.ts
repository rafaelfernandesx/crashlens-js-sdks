import { sha256Hex } from './utils/sha256';
import type { CrashLensEvent } from './event';

/**
 * Gera um fingerprint SHA-256 do conteúdo do evento (excluindo timestamp),
 * para agrupar erros idênticos no backend — espelha ErrorsService.generateFingerprint.
 *
 * @deprecated O SDK não envia mais fingerprint automático: o servidor agrupa os eventos
 * (tipo da exceção + frames do app) e ignora hashes de 64 hex. Defina `fingerprint`
 * apenas para um agrupamento customizado.
 */
export function computeEventHash(event: CrashLensEvent): string {
  const parts = [
    event.message,
    event.severity,
    event.exceptionType,
    event.exceptionMessage,
    event.stackTrace,
    event.context,
    event.user?.id,
    event.url,
    event.environment,
    event.handled,
    stringifySorted(event.tags),
    stringifySorted(event.extra),
    stringifySorted(event.deviceInfo),
  ];
  const content = parts.filter((p) => p !== undefined && p !== null).join('||');
  return sha256Hex(content);
}

function stringifySorted(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') return String(value);
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const obj: Record<string, unknown> = {};
  for (const k of keys) obj[k] = (value as Record<string, unknown>)[k];
  return JSON.stringify(obj);
}