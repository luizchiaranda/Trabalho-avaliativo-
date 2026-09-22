import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { ListDeliveriesDto } from '../deliveries/dto/list-deliveries.dto.js';
import { Role } from '../generated/prisma/client.js';
import { CreateDriverDto } from './dto/create-driver.dto.js';
import { ListDriversDto } from './dto/list-drivers.dto.js';
import {
  UpdateDriverDto,
  UpdateMyDriverProfileDto,
} from './dto/update-driver.dto.js';
import { DriversService } from './drivers.service.js';

@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Roles(Role.DRIVER)
  @Get('me')
  findMe(@CurrentUser() user: AuthUser) {
    return this.drivers.findMe(user);
  }

  @Roles(Role.DRIVER)
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMyDriverProfileDto,
  ) {
    return this.drivers.updateMe(user, dto);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateDriverDto) {
    return this.drivers.create(dto);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @Get()
  findAll(@Query() query: ListDriversDto) {
    return this.drivers.findAll(query);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.findOne(id);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @Get(':id/deliveries')
  findDeliveries(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListDeliveriesDto,
  ) {
    return this.drivers.findDeliveries(user, id, query);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDriverDto) {
    return this.drivers.update(id, dto);
  }
}
