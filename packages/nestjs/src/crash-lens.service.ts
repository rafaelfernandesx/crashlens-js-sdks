import { ArgumentsHost, HttpException, Inject, Injectable, Optional } from '@nestjs/common';
import { initNode, CrashLens, NodeInitOptions } from '@crashlensorg/node';
import { CRASH_LENS_OPTIONS } from './crash-lens.module';
import { defaultResolveUser, getHttpRequestContext, toCrashLensUser } from './request-context';
import type { ResolvedUser } from './request-context';

export interface CrashLensConfig extends NodeInitOptions {
  /** URL base da API CrashLens. */
  baseUrl?: string;
  /** Versão da release do app (padrão: env CRASHLENS_RELEASE, depois GIT_SHA). */
  release?: string;
  /** Ambiente: "production", "staging", etc. (padrão: env CRASHLENS_ENVIRONMENT, depois NODE_ENV). */
  environment?: string;
  /**
   * Decide se uma exceção HTTP com esse status deve ser capturada (padrão: status >= 500).
   * Erros que não são HttpException contam como 500.
   */
  captureStatus?: (status: number) => boolean;
  /**
   * Resolve o usuário do request para anexar aos eventos.
   * Padrão: `req.user` com `id`/`userId`/`sub`.
   */
  resolveUser?: (req: any) => ResolvedUser | null | undefined;
  /** Tags globais. */
  tags?: Record<string, unknown>;
  /** Extra global. */
  extra?: Record<string, unknown>;
}

/**
 * Serviço que mantém o cliente CrashLens e expõe a API de captura.
 * Pode ser injetado em qualquer controller/service.
 */
@Injectable()
export class CrashLensService {
  private readonly client?: CrashLens;
  private readonly captureStatus: (status: number) => boolean = (status) => status >= 500;
  private readonly resolveUser: (req: any) => ResolvedUser | null | undefined = defaultResolveUser;

  constructor(@Optional() @Inject(CRASH_LENS_OPTIONS) options?: CrashLensConfig) {
    if (!options) return;
    if (options.captureStatus) this.captureStatus = options.captureStatus;
    if (options.resolveUser) this.resolveUser = options.resolveUser;
    this.client = initNode({
      ...options,
      release: options.release ?? process.env.CRASHLENS_RELEASE ?? process.env.GIT_SHA,
      environment: options.environment ?? process.env.CRASHLENS_ENVIRONMENT ?? process.env.NODE_ENV,
      enableGlobalHandlers: options.enableGlobalHandlers ?? true,
      collectRuntimeInfo: options.collectRuntimeInfo ?? true,
      enableSessionTracking: options.enableSessionTracking ?? false,
    });
    if (options.tags) {
      for (const [k, v] of Object.entries(options.tags)) {
        this.client.setTag(k, v);
      }
    }
    if (options.extra) {
      for (const [k, v] of Object.entries(options.extra)) {
        this.client.setExtra(k, v);
      }
    }
  }

  get isInitialized(): boolean {
    return this.client?.isInitialized ?? false;
  }

  captureException(error: unknown, params?: Parameters<CrashLens['captureException']>[1]): void {
    this.client?.captureException(error, params);
  }

  /**
   * Captura uma exceção HTTP aplicando o filtro de status (`captureStatus`) e anexando o
   * contexto do request (método, rota, request id, usuário). Pode ser chamado do
   * `catch()` de um filtro de exceções próprio, sem substituí-lo. Nunca lança.
   */
  captureHttpException(exception: unknown, host?: ArgumentsHost): void {
    try {
      if (!this.client) return;
      const status = exception instanceof HttpException ? exception.getStatus() : 500;
      if (!this.captureStatus(status)) return;

      const request = host && host.getType() === 'http' ? host.switchToHttp().getRequest() : undefined;
      const ctx = getHttpRequestContext(request);

      const tags: Record<string, unknown> = { httpStatus: String(status) };
      if (ctx.method) tags.httpMethod = ctx.method;
      if (ctx.route) tags.route = ctx.route;
      if (ctx.requestId) tags.requestId = ctx.requestId;

      let user;
      if (request) {
        try {
          user = toCrashLensUser(this.resolveUser(request));
        } catch {
          // resolveUser do app falhou: segue sem usuário
        }
      }

      this.client.captureException(exception, {
        context: 'nestjs-exception-filter',
        handled: exception instanceof HttpException,
        url: ctx.path,
        user,
        tags,
        extra: { request: { method: ctx.method, route: ctx.route, path: ctx.path, requestId: ctx.requestId } },
      });
    } catch {
      // a captura nunca pode quebrar a resposta do app
    }
  }

  captureMessage(message: string, params?: Parameters<CrashLens['captureMessage']>[1]): void {
    this.client?.captureMessage(message, params);
  }

  captureEvent(params: Parameters<CrashLens['captureEvent']>[0]): void {
    this.client?.captureEvent(params);
  }

  addBreadcrumb(breadcrumb: Parameters<CrashLens['addBreadcrumb']>[0]): void {
    this.client?.addBreadcrumb(breadcrumb);
  }

  setUser(user: Parameters<CrashLens['setUser']>[0]): void {
    this.client?.setUser(user);
  }

  setTag(key: string, value: unknown): void {
    this.client?.setTag(key, value);
  }

  get clientInstance(): CrashLens | undefined {
    return this.client;
  }
}