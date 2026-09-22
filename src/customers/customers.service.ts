import { Injectable, NotFoundException } from '@nestjs/common';
import { pageArgs, paginated } from '../common/dto/pagination-query.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { publicUserSelect } from '../common/utils/selects.js';
import { Prisma } from '../generated/prisma/client.js';
import type { ListOrdersDto } from '../orders/dto/list-orders.dto.js';
import { OrdersService } from '../orders/orders.service.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateMyCustomerProfileDto } from './dto/update-customer.dto.js';

const customerInclude = {
  user: { select: publicUserSelect },
} satisfies Prisma.CustomerInclude;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async findMe(user: AuthUser) {
    const customer = await this.prisma.customer.findUnique({
      where: { userId: user.id },
      include: customerInclude,
    });
    if (!customer)
      throw new NotFoundException('Perfil de cliente não encontrado');
    return customer;
  }

  async updateMe(user: AuthUser, dto: UpdateMyCustomerProfileDto) {
    const me = await this.findMe(user);
    return this.prisma.customer.update({
      where: { id: me.id },
      data: {
        ...(dto.phone && { phone: dto.phone }),
        ...(dto.name && { user: { update: { name: dto.name } } }),
      },
      include: customerInclude,
    });
  }

  async findAll(query: PaginationQueryDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        include: customerInclude,
        orderBy: { createdAt: query.order },
        ...pageArgs(query),
      }),
      this.prisma.customer.count(),
    ]);
    return paginated(data, total, query);
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: customerInclude,
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }

  async findOrders(user: AuthUser, id: string, query: ListOrdersDto) {
    await this.findOne(id);
    return this.orders.list(user, query, { customerId: id });
  }
}
