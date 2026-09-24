import { ApiProperty } from '@nestjs/swagger';

export class CepResponseDto {
  @ApiProperty({ example: '01001000' })
  cep: string;

  @ApiProperty({ example: 'Praça da Sé' })
  street: string;

  @ApiProperty({ example: 'Sé' })
  neighborhood: string;

  @ApiProperty({ example: 'São Paulo' })
  city: string;

  @ApiProperty({ example: 'SP' })
  state: string;
}
