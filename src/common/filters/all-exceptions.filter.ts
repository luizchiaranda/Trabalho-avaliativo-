import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { Prisma } from '../../generated/prisma/client.js';

interface ErrorPayload {
  status: number;
  message: string | string[];
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  deliveries_one_active_per_order: 'O pedido já possui uma entrega ativa',
  deliveries_one_active_per_driver: 'O motorista já possui uma entrega ativa',
  deliveries_one_active_per_vehicle: 'O veículo já possui uma entrega ativa',
};

function isPayloadTooLarge(exception: unknown): boolean {
  return (
    exception instanceof Error &&
    (exception as { type?: unknown }).type === 'entity.too.large'
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const { status, message } = this.normalize(exception);

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${request.method} ${request.originalUrl.split('?')[0]} -> ${status}`,
        stack,
      );
    } else if (status === 401 || status === 403) {
      this.logger.warn(
        JSON.stringify({
          event: 'access_denied',
          status,
          method: request.method,
          path: request.originalUrl.split('?')[0],
          ip: request.ip,
        }),
      );
    }

    response.status(status).json({
      statusCode: status,
      error: STATUS_CODES[status] ?? 'Error',
      message,
      path: request.originalUrl.split('?')[0],
      timestamp: new Date().toISOString(),
    });
  }

  private normalize(exception: unknown): ErrorPayload {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ??
            exception.message);
      return { status: exception.getStatus(), message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    // O corpo da requisição acima do limite do body-parser (ex.: JSON grande
    // demais) chega como um Error comum do Express, não um HttpException do
    // Nest — sem este desvio, viraria 500 em vez do 413 correto.
    if (isPayloadTooLarge(exception)) {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'Corpo da requisição excede o tamanho permitido',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor',
    };
  }

  private fromPrisma(
    error: Prisma.PrismaClientKnownRequestError,
  ): ErrorPayload {
    switch (error.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: this.uniqueMessage(error),
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          message:
            'Operação inválida: o registro está referenciado por outros dados',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Recurso não encontrado',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Erro interno do servidor',
        };
    }
  }

  private uniqueMessage(error: Prisma.PrismaClientKnownRequestError): string {
    const meta = (error.meta ?? {}) as {
      driverAdapterError?: {
        cause?: { table?: string; constraint?: { index?: string } };
      };
    };
    const { table, constraint } = meta.driverAdapterError?.cause ?? {};
    const index = constraint?.index;
    if (!index) return 'Conflito: já existe um registro com estes dados';

    if (CONSTRAINT_MESSAGES[index]) return CONSTRAINT_MESSAGES[index];

    // O Postgres nomeia o índice único como <tabela>_<campo>_key
    const field = index.replace(`${table}_`, '').replace(/_key$/, '');
    return `Já existe um registro com o mesmo valor de: ${field}`;
  }
}
