import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { Role } from '../generated/prisma/client.js';
import { ListOrdersDto } from '../orders/dto/list-orders.dto.js';
import { OrderResponseDto } from '../orders/dto/order-response.dto.js';
import { CustomersService } from './customers.service.js';
import { CustomerResponseDto } from './dto/customer-response.dto.js';
import { UpdateMyCustomerProfileDto } from './dto/update-customer.dto.js';

@ApiTags('Clientes')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: 'Meu perfil de cliente' })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiErrorResponses(401, 403, 404)
  @Get('me')
  findMe(@CurrentUser() user: AuthUser) {
    return this.customers.findMe(user);
  }

  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: 'Atualiza meu nome e/ou telefone' })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMyCustomerProfileDto,
  ) {
    return this.customers.updateMe(user, dto);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({ summary: 'Lista clientes' })
  @ApiPaginatedResponse(CustomerResponseDto)
  @ApiErrorResponses(400, 401, 403)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.customers.findAll(query);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({ summary: 'Detalha um cliente' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.findOne(id);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({ summary: 'Pedidos de um cliente específico' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiPaginatedResponse(OrderResponseDto)
  @ApiErrorResponses(400, 401, 403, 404)
  @Get(':id/orders')
  findOrders(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListOrdersDto,
  ) {
    return this.customers.findOrders(user, id, query);
  }
}
