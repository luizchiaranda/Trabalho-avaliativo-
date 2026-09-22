import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { Role } from '../generated/prisma/client.js';
import { CreateOccurrenceDto } from './dto/create-occurrence.dto.js';
import { OccurrencesService } from './occurrences.service.js';

@Controller('deliveries/:deliveryId/occurrences')
export class OccurrencesController {
  constructor(private readonly occurrences: OccurrencesService) {}

  @Roles(Role.DRIVER, Role.OPERATOR, Role.ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: CreateOccurrenceDto,
  ) {
    return this.occurrences.create(user, deliveryId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.occurrences.list(user, deliveryId);
  }
}
