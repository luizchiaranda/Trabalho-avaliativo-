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
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { DeliveryResponseDto } from '../deliveries/dto/delivery-response.dto.js';
import { ListDeliveriesDto } from '../deliveries/dto/list-deliveries.dto.js';
import { Role } from '../generated/prisma/client.js';
import { CreateDriverDto } from './dto/create-driver.dto.js';
import { DriverResponseDto } from './dto/driver-response.dto.js';
import { ListDriversDto } from './dto/list-drivers.dto.js';
import {
  UpdateDriverDto,
  UpdateMyDriverProfileDto,
} from './dto/update-driver.dto.js';
import { DriversService } from './drivers.service.js';

@ApiTags('Motoristas')
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Roles(Role.DRIVER)
  @ApiOperation({ summary: 'Meu perfil de motorista' })
  @ApiOkResponse({ type: DriverResponseDto })
  @ApiErrorResponses(401, 403, 404)
  @Get('me')
  findMe(@CurrentUser() user: AuthUser) {
    return this.drivers.findMe(user);
  }

  @Roles(Role.DRIVER)
  @ApiOperation({ summary: 'Atualiza meu telefone' })
  @ApiOkResponse({ type: DriverResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMyDriverProfileDto,
  ) {
    return this.drivers.updateMe(user, dto);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Cadastra um motorista',
    description: 'Cria o User (role DRIVER) e o Driver numa única operação.',
  })
  @ApiCreatedResponse({ type: DriverResponseDto })
  @ApiErrorResponses(400, 401, 403, 409)
  @Post()
  create(@Body() dto: CreateDriverDto) {
    return this.drivers.create(dto);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Lista motoristas',
    description:
      '?available=true filtra só quem está ativo, com CNH válida e sem entrega ativa no momento.',
  })
  @ApiPaginatedResponse(DriverResponseDto)
  @ApiErrorResponses(400, 401, 403)
  @Get()
  findAll(@Query() query: ListDriversDto) {
    return this.drivers.findAll(query);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({ summary: 'Detalha um motorista' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: DriverResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.findOne(id);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({ summary: 'Entregas de um motorista específico' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiPaginatedResponse(DeliveryResponseDto)
  @ApiErrorResponses(400, 401, 403, 404)
  @Get(':id/deliveries')
  findDeliveries(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListDeliveriesDto,
  ) {
    return this.drivers.findDeliveries(user, id, query);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Atualiza telefone, CNH ou status de um motorista',
    description:
      'Não pode desativar, nem mudar a categoria da CNH para algo incompatível ' +
      'com o veículo de uma entrega ativa do motorista (409).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: DriverResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDriverDto) {
    return this.drivers.update(id, dto);
  }
}
