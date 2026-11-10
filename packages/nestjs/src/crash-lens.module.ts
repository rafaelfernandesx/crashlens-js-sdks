import { Global, DynamicModule, MiddlewareConsumer, NestModule, Provider, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { CrashLensService, CrashLensConfig } from './crash-lens.service';
import { CrashLensFilter } from './crash-lens.filter';
import { CrashLensInterceptor } from './crash-lens.interceptor';
import { CrashLensScopeMiddleware } from './crash-lens.middleware';

export const CRASH_LENS_OPTIONS = Symbol('CRASH_LENS_OPTIONS');

export interface CrashLensModuleOptions extends CrashLensConfig {
  /** Registra o filtro global de exceções (padrão: true). */
  globalFilter?: boolean;
  /** Registra o interceptor global de requests (padrão: true). */
  globalInterceptor?: boolean;
  /** Roda cada request HTTP em um escopo isolado (padrão: true). */
  isolateRequestScope?: boolean;
}

/**
 * Módulo do CrashLens para NestJS.
 *
 * @Module({ imports: [CrashLensModule.forRoot({ apiKey: 'cl_live_xxx' }) ] })
 */
@Global()
export class CrashLensModule implements NestModule {
  private static isolateRequestScope = true;

  configure(consumer: MiddlewareConsumer): void {
    if (!CrashLensModule.isolateRequestScope) return;
    consumer.apply(CrashLensScopeMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }

  static forRoot(options: CrashLensModuleOptions): DynamicModule {
    CrashLensModule.isolateRequestScope = options.isolateRequestScope !== false;
    const providers: Provider[] = [
      { provide: CRASH_LENS_OPTIONS, useValue: options },
      CrashLensService,
    ];

    if (options.globalFilter !== false) {
      providers.push({ provide: APP_FILTER, useClass: CrashLensFilter });
    }
    if (options.globalInterceptor !== false) {
      providers.push({ provide: APP_INTERCEPTOR, useClass: CrashLensInterceptor });
    }

    return {
      module: CrashLensModule,
      global: true,
      providers,
      exports: [CrashLensService],
    };
  }
}