import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { Role } from '../generated/prisma/client.js';
import { ListOrdersDto } from '../orders/dto/list-orders.dto.js';
import { CustomersService } from './customers.service.js';
import { UpdateMyCustomerProfileDto } from './dto/update-customer.dto.js';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Roles(Role.CUSTOMER)
  @Get('me')
  findMe(@CurrentUser() user: AuthUser) {
    return this.customers.findMe(user);
  }

  @Roles(Role.CUSTOMER)
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMyCustomerProfileDto,
  ) {
    return this.customers.updateMe(user, dto);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.customers.findAll(query);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.findOne(id);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @Get(':id/orders')
  findOrders(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListOrdersDto,
  ) {
    return this.customers.findOrders(user, id, query);
  }
}
