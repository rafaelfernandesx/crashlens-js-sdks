import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { CrashLensService } from './crash-lens.service';

/**
 * Interceptor que adiciona o breadcrumb HTTP de cada request.
 *
 * Ele NÃO captura erros: a captura é feita somente pelo `CrashLensFilter` (ou por
 * `CrashLensService.captureHttpException` num filtro próprio). Usado sozinho, sem filtro,
 * os erros não são enviados ao CrashLens.
 */
@Injectable()
export class CrashLensInterceptor implements NestInterceptor {
  constructor(private readonly crashLens: CrashLensService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest();
      if (request) {
        const url = String(request.originalUrl ?? request.url ?? '/');
        const path = url.split('?')[0];
        this.crashLens.addBreadcrumb({
          message: `${request.method ?? 'GET'} ${path}`,
          type: 'request',
          category: 'http',
          data: { method: request.method, url: path },
        });
      }
    }
    return next.handle();
  }
}
