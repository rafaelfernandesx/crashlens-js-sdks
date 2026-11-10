import { Injectable, NestMiddleware } from '@nestjs/common';
import { runWithScope } from '@crashlensorg/node';

/**
 * Executa cada request HTTP dentro de um escopo isolado do CrashLens, para que
 * setUser/setTag/breadcrumbs de um request não vazem para outros concorrentes.
 * Registrado automaticamente pelo CrashLensModule para todas as rotas.
 */
@Injectable()
export class CrashLensScopeMiddleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: (error?: unknown) => void): void {
    runWithScope(() => next());
  }
}
