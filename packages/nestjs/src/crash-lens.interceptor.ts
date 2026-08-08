import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { CrashLensService } from './crash-lens.service';

/**
 * Interceptor que adiciona breadcrumbs de request e captura erros dos handlers.
 */
@Injectable()
export class CrashLensInterceptor implements NestInterceptor {
  constructor(private readonly crashLens: CrashLensService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    if (request) {
      this.crashLens.addBreadcrumb({
        message: `${request.method ?? 'GET'} ${request.url ?? '/'}`,
        type: 'request',
        category: 'http',
        data: { method: request.method, url: request.url },
      });
    }

    return next.handle().pipe(
      tap({
        error: (error) => {
          this.crashLens.captureException(error, {
            handled: false,
            context: 'context.interceptor',
            tags: { httpMethod: request?.method },
            extra: { url: request?.url },
          });
        },
      }),
      catchError((error) => throwError(() => error)),
    );
  }
}