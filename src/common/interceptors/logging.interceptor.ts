import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Observable, tap } from 'rxjs';
import type { AuthUser } from '../types/auth-user.js';

const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

/**
 * Registra uma linha JSON por requisição (método, rota, status, duração, usuário)
 * e devolve os cabeçalhos X-Request-Id e X-Response-Time.
 * Nunca registra body, query string nem o cabeçalho Authorization.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthUser }>();
    const response = http.getResponse<Response>();

    const incoming = request.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
        ? incoming
        : randomUUID();
    const startedAt = process.hrtime.bigint();

    response.setHeader('X-Request-Id', requestId);

    const finish = (statusCode: number) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      if (!response.headersSent) {
        response.setHeader('X-Response-Time', `${durationMs.toFixed(1)}ms`);
      }
      this.logger.log(
        JSON.stringify({
          requestId,
          method: request.method,
          path: request.originalUrl.split('?')[0],
          statusCode,
          durationMs: Number(durationMs.toFixed(1)),
          userId: request.user?.id ?? null,
        }),
      );
    };

    return next.handle().pipe(
      tap({
        next: () => finish(response.statusCode),
        error: (error: unknown) =>
          finish(error instanceof HttpException ? error.getStatus() : 500),
      }),
    );
  }
}
