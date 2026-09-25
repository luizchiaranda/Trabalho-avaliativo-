import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { Role } from '../generated/prisma/client.js';
import { CreateOccurrenceDto } from './dto/create-occurrence.dto.js';
import { OccurrenceResponseDto } from './dto/occurrence-response.dto.js';
import { OccurrencesService } from './occurrences.service.js';

@ApiTags('Ocorrências')
@Controller('deliveries/:deliveryId/occurrences')
export class OccurrencesController {
  constructor(private readonly occurrences: OccurrencesService) {}

  @Roles(Role.DRIVER, Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Registra uma ocorrência numa entrega',
    description:
      'Motorista: só na sua própria entrega. Não é possível registrar em entrega já finalizada (409).',
  })
  @ApiParam({ name: 'deliveryId', format: 'uuid' })
  @ApiCreatedResponse({ type: OccurrenceResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: CreateOccurrenceDto,
  ) {
    return this.occurrences.create(user, deliveryId, dto);
  }

  @ApiOperation({
    summary: 'Lista as ocorrências de uma entrega, em ordem cronológica',
  })
  @ApiParam({ name: 'deliveryId', format: 'uuid' })
  @ApiOkResponse({ type: OccurrenceResponseDto, isArray: true })
  @ApiErrorResponses(400, 401, 404)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.occurrences.list(user, deliveryId);
  }
}
