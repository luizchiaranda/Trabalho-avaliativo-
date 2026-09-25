import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
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
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { ListVehiclesDto } from './dto/list-vehicles.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { VehicleResponseDto } from './dto/vehicle-response.dto.js';
import { VehiclesService } from './vehicles.service.js';

@ApiTags('Veículos')
@Roles(Role.OPERATOR, Role.ADMIN)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @ApiOperation({ summary: 'Cadastra um veículo' })
  @ApiCreatedResponse({ type: VehicleResponseDto })
  @ApiErrorResponses(400, 401, 403, 409)
  @Post()
  create(@Body() dto: CreateVehicleDto) {
    return this.vehicles.create(dto);
  }

  @ApiOperation({
    summary: 'Lista veículos',
    description:
      '?available=true filtra só quem está com status AVAILABLE e sem entrega ativa no momento.',
  })
  @ApiPaginatedResponse(VehicleResponseDto)
  @ApiErrorResponses(400, 401, 403)
  @Get()
  findAll(@Query() query: ListVehiclesDto) {
    return this.vehicles.findAll(query);
  }

  @ApiOperation({ summary: 'Detalha um veículo' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: VehicleResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.findOne(id);
  }

  @ApiOperation({ summary: 'Entregas de um veículo específico' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiPaginatedResponse(DeliveryResponseDto)
  @ApiErrorResponses(400, 401, 403, 404)
  @Get(':id/deliveries')
  findDeliveries(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListDeliveriesDto,
  ) {
    return this.vehicles.findDeliveries(user, id, query);
  }

  @ApiOperation({
    summary: 'Atualiza placa, modelo, tipo, capacidade ou status',
    description:
      'Não pode sair de serviço (MAINTENANCE/INACTIVE), nem mudar tipo ou reduzir ' +
      'capacidade de um jeito que quebre uma entrega ativa deste veículo (409).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: VehicleResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehicles.update(id, dto);
  }

  @ApiOperation({
    summary: 'Exclui um veículo',
    description:
      'Só é possível se o veículo nunca teve nenhuma entrega (409 caso contrário; use status: INACTIVE).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Excluído' })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @HttpCode(204)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.remove(id);
  }
}
