import { BaseTransport, parseRetryAfter, PostFn, PostFnOpts, TResponse } from './transport';

/**
 * Transporte baseado em fetch global (browser + Node.js 18+).
 */
export class FetchTransport extends BaseTransport {
  protected async post(opts: PostFnOpts): Promise<TResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.timeoutMs);
    try {
      const response = await fetch(this.baseUrl + opts.path, {
        method: 'POST',
        headers: { ...opts.headers },
        body: opts.body,
        signal: controller.signal,
        keepalive: true,
      });
      const text = await response.text().catch(() => '');
      const ok = response.status >= 200 && response.status < 300;
      if (ok) return { ok: true, status: response.status, body: text };
      return {
        ok: false,
        status: response.status,
        body: text,
        retryAfter: parseRetryAfter(response.headers.get('retry-after')),
      };
    } catch (err) {
      const status = err instanceof Error && err.name === 'AbortError' ? 408 : 0;
      return { ok: false, status, body: String(err) };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export type { PostFn, TResponse };