import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { CrashLensService } from './crash-lens.service';

/**
 * Captura exceções e as envia ao CrashLens (respeitando `captureStatus`, padrão >= 500),
 * preservando o comportamento padrão do NestJS. É o único ponto de captura do módulo.
 *
 * Se o app já tem um filtro global próprio, use `CrashLensService.captureHttpException`
 * dentro dele (com `globalFilter: false`).
 */
@Catch()
export class CrashLensFilter extends BaseExceptionFilter implements ExceptionFilter {
  constructor(private readonly crashLens: CrashLensService) {
    super();
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    this.crashLens.captureHttpException(exception, host);
    super.catch(exception, host);
  }
}
