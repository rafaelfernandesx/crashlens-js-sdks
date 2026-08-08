import { Inject, Injectable, Optional } from '@nestjs/common';
import { initNode, CrashLens, NodeInitOptions } from '@crashlens/node';
import { CRASH_LENS_OPTIONS } from './crash-lens.module';

export interface CrashLensConfig extends NodeInitOptions {
  /** URL base da API CrashLens. */
  baseUrl?: string;
  /** Versão da release do app. */
  release?: string;
  /** Ambiente: "production", "staging", etc. */
  environment?: string;
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

  constructor(@Optional() @Inject(CRASH_LENS_OPTIONS) options?: CrashLensConfig) {
    if (!options) return;
    this.client = initNode({
      ...options,
      enableGlobalHandlers: options.enableGlobalHandlers ?? false,
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