import { ConflictException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/types/auth-user.js';
import { DeliveriesService } from '../deliveries/deliveries.service.js';
import { isFinalStatus } from '../deliveries/delivery.rules.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateOccurrenceDto } from './dto/create-occurrence.dto.js';

const occurrenceSelect = {
  id: true,
  deliveryId: true,
  type: true,
  description: true,
  createdAt: true,
  reportedBy: { select: { id: true, name: true, role: true } },
};

@Injectable()
export class OccurrencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveries: DeliveriesService,
  ) {}

  async create(user: AuthUser, deliveryId: string, dto: CreateOccurrenceDto) {
    const delivery = await this.deliveries.findAccessibleOrFail(
      user,
      deliveryId,
    );
    if (isFinalStatus(delivery.status)) {
      throw new ConflictException(
        `Não é possível registrar ocorrência em entrega ${delivery.status}`,
      );
    }
    return this.prisma.occurrence.create({
      data: {
        deliveryId,
        reportedById: user.id,
        type: dto.type,
        description: dto.description,
      },
      select: occurrenceSelect,
    });
  }

  async list(user: AuthUser, deliveryId: string) {
    await this.deliveries.findAccessibleOrFail(user, deliveryId);
    return this.prisma.occurrence.findMany({
      where: { deliveryId },
      orderBy: { createdAt: 'asc' },
      select: occurrenceSelect,
    });
  }
}
