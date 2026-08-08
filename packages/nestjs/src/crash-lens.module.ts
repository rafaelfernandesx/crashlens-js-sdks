import { Global, DynamicModule, Provider } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { CrashLensService, CrashLensConfig } from './crash-lens.service';
import { CrashLensFilter } from './crash-lens.filter';
import { CrashLensInterceptor } from './crash-lens.interceptor';

export const CRASH_LENS_OPTIONS = Symbol('CRASH_LENS_OPTIONS');

export interface CrashLensModuleOptions extends CrashLensConfig {
  /** Registra o filtro global de exceções (padrão: true). */
  globalFilter?: boolean;
  /** Registra o interceptor global de requests (padrão: true). */
  globalInterceptor?: boolean;
}

/**
 * Módulo do CrashLens para NestJS.
 *
 * @Module({ imports: [CrashLensModule.forRoot({ apiKey: 'cl_live_xxx' }) ] })
 */
@Global()
export class CrashLensModule {
  static forRoot(options: CrashLensModuleOptions): DynamicModule {
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