import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import { CepService } from './cep.service.js';
import { CepResponseDto } from './dto/cep-response.dto.js';
import { ParseCepPipe } from './parse-cep.pipe.js';

@ApiTags('CEP')
@Controller('cep')
export class CepController {
  constructor(private readonly cep: CepService) {}

  @ApiOperation({
    summary: 'Consulta um CEP (integração externa via HttpService)',
    description:
      'Usado internamente por POST /orders para resolver origem e destino. ' +
      'CEP_API_BASE_URL e CEP_API_TIMEOUT_MS vêm do ambiente.',
  })
  @ApiParam({
    name: 'cep',
    example: '01001000',
    description: '8 dígitos, com ou sem hífen',
  })
  @ApiOkResponse({ type: CepResponseDto })
  @ApiErrorResponses(400, 401, 404, 502, 504)
  @Get(':cep')
  lookup(@Param('cep', ParseCepPipe) cep: string) {
    return this.cep.lookup(cep);
  }
}
