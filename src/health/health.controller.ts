import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import { HealthResponseDto } from './dto/health-response.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('Saúde')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @ApiSecurity('ApiKey')
  @ApiOperation({
    summary: 'Verifica se a API e o banco de dados estão de pé',
    description: 'Única rota sem nenhuma restrição além da X-API-KEY.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ description: 'Banco de dados indisponível' })
  @ApiErrorResponses(401)
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Banco de dados indisponível');
    }
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
