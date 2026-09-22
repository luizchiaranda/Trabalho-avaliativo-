import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { pageArgs, paginated } from '../common/dto/pagination-query.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { DeliveriesService } from '../deliveries/deliveries.service.js';
import {
  ACTIVE_DELIVERY_STATUSES,
  LICENSE_ALLOWED_VEHICLES,
} from '../deliveries/delivery.rules.js';
import type { ListDeliveriesDto } from '../deliveries/dto/list-deliveries.dto.js';
import { Prisma, VehicleStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import type { ListVehiclesDto } from './dto/list-vehicles.dto.js';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto.js';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveries: DeliveriesService,
  ) {}

  create(dto: CreateVehicleDto) {
    return this.prisma.vehicle.create({ data: dto });
  }

  async findAll(query: ListVehiclesDto) {
    const where: Prisma.VehicleWhereInput = {
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
      ...(query.available === true && {
        status: VehicleStatus.AVAILABLE,
        deliveries: { none: { status: { in: ACTIVE_DELIVERY_STATUSES } } },
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { createdAt: query.order },
        ...pageArgs(query),
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado');
    return vehicle;
  }

  async update(id: string, dto: UpdateVehicleDto) {
    await this.findOne(id);
    const leavingService =
      dto.status === VehicleStatus.MAINTENANCE ||
      dto.status === VehicleStatus.INACTIVE;
    const changesCompatibility =
      dto.type !== undefined || dto.capacityKg !== undefined;

    if (leavingService || changesCompatibility) {
      const active = await this.prisma.delivery.findFirst({
        where: { vehicleId: id, status: { in: ACTIVE_DELIVERY_STATUSES } },
        select: {
          order: { select: { weightKg: true } },
          driver: { select: { licenseCategory: true } },
        },
      });

      if (active && leavingService) {
        throw new ConflictException(
          'Veículo em entrega ativa não pode ser colocado em manutenção ou inativado',
        );
      }
      if (
        active &&
        dto.type !== undefined &&
        !LICENSE_ALLOWED_VEHICLES[active.driver.licenseCategory].includes(
          dto.type,
        )
      ) {
        throw new ConflictException(
          `Não é possível mudar o tipo para ${dto.type}: a CNH categoria ${active.driver.licenseCategory} do motorista da entrega ativa não habilita esse veículo`,
        );
      }
      if (
        active &&
        dto.capacityKg !== undefined &&
        dto.capacityKg < active.order.weightKg
      ) {
        throw new ConflictException(
          `Capacidade não pode ficar abaixo do peso (${active.order.weightKg} kg) já em entrega ativa neste veículo`,
        );
      }
    }
    return this.prisma.vehicle.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    const deliveries = await this.prisma.delivery.count({
      where: { vehicleId: id },
    });
    if (deliveries > 0) {
      throw new ConflictException(
        'Veículo com histórico de entregas não pode ser excluído; altere o status para INACTIVE',
      );
    }
    await this.prisma.vehicle.delete({ where: { id } });
  }

  async findDeliveries(user: AuthUser, id: string, query: ListDeliveriesDto) {
    await this.findOne(id);
    return this.deliveries.list(user, query, { vehicleId: id });
  }
}
