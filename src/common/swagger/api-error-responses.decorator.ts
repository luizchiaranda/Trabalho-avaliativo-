import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.dto.js';

const DESCRIPTIONS: Record<number, string> = {
  400: 'Body, query ou parâmetro inválido',
  401: 'X-API-KEY ausente/inválida, ou token ausente/inválido',
  403: 'Autenticado, mas o papel não permite esta operação',
  404: 'Recurso não encontrado (inclusive se pertencer a outro usuário)',
  409: 'Conflito de regra de negócio, de estado ou de unicidade',
  413: 'Arquivo ou corpo da requisição grande demais',
  502: 'Provedor externo de CEP indisponível ou com resposta inválida',
  504: 'Provedor externo de CEP excedeu o tempo limite',
};

/**
 * Documenta, de uma vez, os erros padronizados que AllExceptionsFilter pode
 * devolver para os códigos informados. Evita repetir o mesmo @ApiResponse em
 * cada endpoint — todos usam exatamente o mesmo formato (ErrorResponseDto).
 */
export function ApiErrorResponses(...statusCodes: number[]) {
  return applyDecorators(
    ...statusCodes.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status] ?? 'Erro',
        type: ErrorResponseDto,
      }),
    ),
  );
}
