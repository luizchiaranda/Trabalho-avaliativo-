import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginationMetaDto } from './pagination-meta.dto.js';

/**
 * Documenta o formato { data: T[], meta: PaginationMetaDto } devolvido por
 * paginated() (src/common/dto/pagination-query.dto.ts) para qualquer DTO T.
 */
export function ApiPaginatedResponse<TModel extends Type<unknown>>(
  model: TModel,
  description = 'Lista paginada',
) {
  return applyDecorators(
    ApiExtraModels(PaginationMetaDto, model),
    ApiOkResponse({
      description,
      schema: {
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
        },
      },
    }),
  );
}
