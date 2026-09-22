import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CepService } from '../cep/cep.service.js';
import { pageArgs, paginated } from '../common/dto/pagination-query.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { DeliveriesService } from '../deliveries/deliveries.service.js';
import type { ListDeliveriesDto } from '../deliveries/dto/list-deliveries.dto.js';
import { OrderStatus, Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import type { ListOrdersDto } from './dto/list-orders.dto.js';

const orderInclude = {
  customer: {
    select: {
      id: true,
      phone: true,
      user: { select: { name: true, email: true } },
    },
  },
} satisfies Prisma.DeliveryOrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cep: CepService,
    private readonly deliveries: DeliveriesService,
  ) {}

  async create(user: AuthUser, dto: CreateOrderDto) {
    const customerId = await this.resolveCustomerId(user, dto.customerId);

    if (
      dto.origin.cep === dto.destination.cep &&
      dto.origin.number === dto.destination.number
    ) {
      throw new BadRequestException('Origem e destino não podem ser iguais');
    }

    const [origin, destination] = await Promise.all([
      this.cep.lookup(dto.origin.cep),
      this.cep.lookup(dto.destination.cep),
    ]);

    return this.prisma.deliveryOrder.create({
      data: {
        customerId,
        description: dto.description,
        weightKg: dto.weightKg,
        originCep: origin.cep,
        originStreet: origin.street,
        originNumber: dto.origin.number,
        originComplement: dto.origin.complement,
        originNeighborhood: origin.neighborhood,
        originCity: origin.city,
        originState: origin.state,
        destinationCep: destination.cep,
        destinationStreet: destination.street,
        destinationNumber: dto.destination.number,
        destinationComplement: dto.destination.complement,
        destinationNeighborhood: destination.neighborhood,
        destinationCity: destination.city,
        destinationState: destination.state,
      },
      include: orderInclude,
    });
  }

  async list(
    user: AuthUser,
    query: ListOrdersDto,
    scope: Prisma.DeliveryOrderWhereInput = {},
  ) {
    const where: Prisma.DeliveryOrderWhereInput = {
      AND: [
        this.accessWhere(user),
        scope,
        {
          ...(query.status && { status: query.status }),
          ...(query.customerId && { customerId: query.customerId }),
        },
      ],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.deliveryOrder.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: query.order },
        ...pageArgs(query),
      }),
      this.prisma.deliveryOrder.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  async findOne(user: AuthUser, id: string) {
    const order = await this.prisma.deliveryOrder.findFirst({
      where: { id, ...this.accessWhere(user) },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  async findDeliveries(user: AuthUser, id: string, query: ListDeliveriesDto) {
    await this.findOne(user, id);
    return this.deliveries.list(user, query, { orderId: id });
  }

  async cancel(user: AuthUser, id: string) {
    const order = await this.findOne(user, id);

    if (order.status === OrderStatus.SCHEDULED) {
      throw new ConflictException(
        'Pedido já possui entrega atribuída. Cancele a entrega antes (PATCH /deliveries/:id/status)',
      );
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException(
        `Pedido no estado ${order.status} não pode ser cancelado`,
      );
    }

    const changed = await this.prisma.deliveryOrder.updateMany({
      where: { id, status: OrderStatus.PENDING },
      data: { status: OrderStatus.CANCELLED },
    });
    if (changed.count !== 1) {
      throw new ConflictException('O pedido foi alterado por outra requisição');
    }
    return this.findOne(user, id);
  }

  private accessWhere(user: AuthUser): Prisma.DeliveryOrderWhereInput {
    return user.role === Role.CUSTOMER ? { customer: { userId: user.id } } : {};
  }

  private async resolveCustomerId(user: AuthUser, requested?: string) {
    if (user.role === Role.CUSTOMER) {
      const profile = await this.prisma.customer.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!profile)
        throw new NotFoundException('Perfil de cliente não encontrado');
      if (requested && requested !== profile.id) {
        throw new ForbiddenException(
          'Clientes só podem criar pedidos em seu próprio nome',
        );
      }
      return profile.id;
    }

    if (!requested) {
      throw new BadRequestException(
        'customerId é obrigatório para operadores e administradores',
      );
    }
    const customer = await this.prisma.customer.findUnique({
      where: { id: requested },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer.id;
  }
}
