import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { CrashLensService } from './crash-lens.service';

/**
 * Captura todas as exceções não tratadas e as envia ao CrashLens,
 * preservando o comportamento padrão do NestJS.
 */
@Catch()
export class CrashLensFilter extends BaseExceptionFilter implements ExceptionFilter {
  constructor(private readonly crashLens: CrashLensService) {
    super();
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const request = host.switchToHttp().getRequest();

    const message = exception instanceof Error ? exception.message : String(exception);

    this.crashLens.captureException(exception, {
      context: 'nestjs-exception-filter',
      handled: false,
      tags: {
        httpStatus: String(status),
        httpMethod: request?.method,
      },
      extra: {
        url: request?.url,
        method: request?.method,
        statusCode: status,
        error: message,
      },
    });

    super.catch(exception, host);
  }
}