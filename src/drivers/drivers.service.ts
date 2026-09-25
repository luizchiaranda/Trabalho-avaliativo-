import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { pageArgs, paginated } from '../common/dto/pagination-query.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { deleteUserAccount } from '../common/utils/delete-user-account.js';
import { hashPassword } from '../common/utils/password.js';
import { publicUserSelect } from '../common/utils/selects.js';
import { DeliveriesService } from '../deliveries/deliveries.service.js';
import {
  ACTIVE_DELIVERY_STATUSES,
  LICENSE_ALLOWED_VEHICLES,
  startOfTodayUtc,
} from '../deliveries/delivery.rules.js';
import type { ListDeliveriesDto } from '../deliveries/dto/list-deliveries.dto.js';
import { Prisma, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateDriverDto } from './dto/create-driver.dto.js';
import type { ListDriversDto } from './dto/list-drivers.dto.js';
import type {
  UpdateDriverDto,
  UpdateMyDriverProfileDto,
} from './dto/update-driver.dto.js';

const driverInclude = {
  user: { select: publicUserSelect },
} satisfies Prisma.DriverInclude;

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveries: DeliveriesService,
  ) {}

  async create(dto: CreateDriverDto) {
    return this.prisma.driver.create({
      data: {
        licenseNumber: dto.licenseNumber,
        licenseCategory: dto.licenseCategory,
        licenseExpiresAt: new Date(dto.licenseExpiresAt),
        phone: dto.phone,
        user: {
          create: {
            name: dto.name,
            email: dto.email,
            passwordHash: await hashPassword(dto.password),
            role: Role.DRIVER,
          },
        },
      },
      include: driverInclude,
    });
  }

  async findAll(query: ListDriversDto) {
    const where: Prisma.DriverWhereInput = {
      ...(query.active !== undefined && { active: query.active }),
      ...(query.licenseCategory && { licenseCategory: query.licenseCategory }),
      ...(query.available === true && {
        active: true,
        licenseExpiresAt: { gte: startOfTodayUtc() },
        deliveries: { none: { status: { in: ACTIVE_DELIVERY_STATUSES } } },
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.driver.findMany({
        where,
        include: driverInclude,
        orderBy: { createdAt: query.order },
        ...pageArgs(query),
      }),
      this.prisma.driver.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  async findOne(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: driverInclude,
    });
    if (!driver) throw new NotFoundException('Motorista não encontrado');
    return driver;
  }

  async findMe(user: AuthUser) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId: user.id },
      include: driverInclude,
    });
    if (!driver)
      throw new NotFoundException('Perfil de motorista não encontrado');
    return driver;
  }

  async updateMe(user: AuthUser, dto: UpdateMyDriverProfileDto) {
    const me = await this.findMe(user);
    return this.prisma.driver.update({
      where: { id: me.id },
      data: { phone: dto.phone },
      include: driverInclude,
    });
  }

  async update(id: string, dto: UpdateDriverDto) {
    await this.findOne(id);
    const deactivating = dto.active === false;
    const changesCompatibility = dto.licenseCategory !== undefined;

    if (deactivating || changesCompatibility) {
      const active = await this.prisma.delivery.findFirst({
        where: { driverId: id, status: { in: ACTIVE_DELIVERY_STATUSES } },
        select: { vehicle: { select: { type: true } } },
      });

      if (active && deactivating) {
        throw new ConflictException(
          'Motorista com entrega ativa não pode ser desativado',
        );
      }
      if (
        active &&
        dto.licenseCategory !== undefined &&
        !LICENSE_ALLOWED_VEHICLES[dto.licenseCategory].includes(
          active.vehicle.type,
        )
      ) {
        throw new ConflictException(
          `Não é possível mudar a categoria da CNH para ${dto.licenseCategory}: o veículo da entrega ativa é do tipo ${active.vehicle.type}, que essa categoria não habilita`,
        );
      }
    }
    const { licenseExpiresAt, ...changes } = dto;
    return this.prisma.driver.update({
      where: { id },
      data: {
        ...changes,
        licenseExpiresAt: licenseExpiresAt
          ? new Date(licenseExpiresAt)
          : undefined,
      },
      include: driverInclude,
    });
  }

  async remove(id: string) {
    const driver = await this.findOne(id);
    await deleteUserAccount(
      this.prisma,
      driver.userId,
      'desative o motorista (PATCH /drivers/:id com active: false)',
    );
  }

  async findDeliveries(user: AuthUser, id: string, query: ListDeliveriesDto) {
    await this.findOne(id);
    return this.deliveries.list(user, query, { driverId: id });
  }
}
