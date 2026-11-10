import type { IncomingMessage, ServerResponse } from 'node:http';
import { CrashLens } from '@crashlensorg/core';
import { runWithScope } from './scope-context';

export interface CrashRequestInfo {
  method?: string;
  url?: string;
  statusCode?: number;
  userAgent?: string;
  remoteAddress?: string;
  route?: string;
  requestId?: string;
}

/** Extrai informações de contexto HTTP de uma requisição. */
export function getRequestContext(req: IncomingMessage): CrashRequestInfo {
  const info: CrashRequestInfo = {
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    remoteAddress: req.socket?.remoteAddress,
    requestId:
      (req.headers['x-request-id'] as string) ??
      (req.headers['x-amzn-trace-id'] as string),
  };
  return info;
}

export type HttpRequest = IncomingMessage;
export type HttpResponse = ServerResponse;
export type NextFn = (err?: unknown) => void;

export interface MiddlewareOptions {
  /** Adiciona um breadcrumb por request (padrão: true). */
  breadcrumbs?: boolean;
}

/**
 * Middleware de rastreamento de requests (compatível com Express/Connect).
 * Adiciona um breadcrumb de navegação em cada request e isola o escopo por request.
 */
export function crashlensMiddleware(client: CrashLens, opts: MiddlewareHttpOptions = {}) {
  return (req: HttpRequest, res: HttpResponse, next: NextFn): void => {
    const breadcrumbs = opts.breadcrumbs ?? true;
    res.on('finish', () => {
      if (!breadcrumbs) return;
      const ctx = getRequestContext(req);
      client.addBreadcrumb({
        message: `${ctx.method ?? 'GET'} ${ctx.url ?? '/'}`,
        type: 'request',
        category: 'http',
        data: {
          method: ctx.method,
          url: ctx.url,
          statusCode: res.statusCode,
          requestId: ctx.requestId,
        },
      });
    });
    // cada request roda em um escopo isolado (user/tags/breadcrumbs não vazam)
    runWithScope(() => next());
  };
}

export interface MiddlewareHttpOptions {
  breadcrumbs?: boolean;
}

/**
 * Middleware de captura de erros (Express erro handler).
 * Uso: app.use(crashlensErrorHandler(client));
 */
export function crashlensErrorHandler(client: CrashLens) {
  return (
    err: unknown,
    req: HttpRequest,
    res: HttpResponse,
    next: NextFn,
  ): void => {
    const ctx = getRequestContext(req);
    client.captureException(err, {
      context: 'http-error',
      handled: true,
      tags: {
        httpMethod: ctx.method,
      },
      extra: {
        requestUrl: ctx.url,
        requestMethod: ctx.method,
        statusCode: res.statusCode,
        requestId: ctx.requestId,
      },
    });
    // repassa para o handler de erros do framework
    next(err);
  };
}