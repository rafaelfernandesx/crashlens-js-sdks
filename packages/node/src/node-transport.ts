import { BaseTransport, parseRetryAfter, PostFnOpts, TResponse } from '@crashlensorg/core';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

/**
 * Transporte para Node.js usando http/https nativo.
 * Evita a dependência de fetch global (Node 18+ opcional) e oferece controle
 * fino de timeouts e keep-alive.
 */
export class NodeHttpTransport extends BaseTransport {
  protected async post(opts: PostFnOpts): Promise<TResponse> {
    const url = new URL(this.baseUrl + opts.path);
    const lib = url.protocol === 'https:' ? https : http;
    const body = opts.body;

    return new Promise<TResponse>((resolve) => {
      const req = lib.request(
        url,
        {
          method: 'POST',
          headers: {
            ...(opts.headers ?? {}),
            ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const bodyText = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode ?? 0;
            if (status >= 200 && status < 300) {
              resolve({ ok: true, status, body: bodyText });
              return;
            }
            const ra = res.headers['retry-after'];
            resolve({
              ok: false,
              status,
              body: bodyText,
              retryAfter: parseRetryAfter(Array.isArray(ra) ? ra[0] : ra),
            });
          });
        },
      );
      req.setTimeout(opts.timeoutMs ?? this.timeoutMs, () => req.destroy());
      req.on('error', () => resolve({ ok: false, status: 0 }));
      if (body) req.write(body);
      req.end();
    });
  }
}