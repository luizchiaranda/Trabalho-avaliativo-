import { ApiProperty } from '@nestjs/swagger';

/**
 * Formato único de erro devolvido por AllExceptionsFilter para toda a API.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode: number;

  @ApiProperty({ example: 'Not Found' })
  error: string;

  @ApiProperty({
    example: 'Recurso não encontrado',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiProperty({ example: '/orders/3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  path: string;

  @ApiProperty({ example: '2026-09-24T12:00:00.000Z' })
  timestamp: string;
}
