import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CreateOrderDto } from './dto/create-order.dto.js';
import { ListOrdersDto } from './dto/list-orders.dto.js';
import { OrderResponseDto } from './dto/order-response.dto.js';
import { OrdersService } from './orders.service.js';

@ApiTags('Pedidos')
@Roles(Role.CUSTOMER, Role.OPERATOR, Role.ADMIN)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @ApiOperation({
    summary: 'Cria um pedido',
    description:
      'Origem e destino são resolvidos pela API de CEP (HttpService). CUSTOMER só pode criar ' +
      'em seu próprio nome (403 se informar customerId de outro cliente); ' +
      'OPERATOR/ADMIN precisam informar customerId.',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 502, 504)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user, dto);
  }

  @ApiOperation({
    summary: 'Lista pedidos',
    description: 'CUSTOMER só vê os próprios; OPERATOR/ADMIN veem todos.',
  })
  @ApiPaginatedResponse(OrderResponseDto)
  @ApiErrorResponses(400, 401, 403)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListOrdersDto) {
    return this.orders.list(user, query);
  }

  @ApiOperation({ summary: 'Detalha um pedido' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.findOne(user, id);
  }

  @ApiOperation({
    summary: 'Tentativas de entrega deste pedido',
    description: 'Um pedido pode ter mais de uma (se uma falhar e for reatribuído).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiPaginatedResponse(DeliveryResponseDto)
  @ApiErrorResponses(400, 401, 403, 404)
  @Get(':id/deliveries')
  findDeliveries(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListDeliveriesDto,
  ) {
    return this.orders.findDeliveries(user, id, query);
  }

  @ApiOperation({
    summary: 'Cancela um pedido',
    description: 'Só é possível enquanto o pedido está PENDING (409 caso contrário).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiErrorResponses(401, 403, 404, 409)
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.cancel(user, id);
  }
}
