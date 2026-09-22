import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, extname, join, resolve } from 'node:path';
import { pageArgs, paginated } from '../common/dto/pagination-query.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import {
  DeliveryStatus,
  OrderStatus,
  Prisma,
  Role,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateDeliveryDto } from './dto/create-delivery.dto.js';
import type { ListDeliveriesDto } from './dto/list-deliveries.dto.js';
import type { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto.js';
import {
  ACTIVE_DELIVERY_STATUSES,
  DRIVER_TARGET_STATUSES,
  ORDER_STATUS_ON_DELIVERY,
  STAFF_TARGET_STATUSES,
  canTransition,
  findAssignmentConflicts,
  isFinalStatus,
} from './delivery.rules.js';
import { detectFileType } from './file-signature.js';

const deliveryInclude = {
  order: {
    include: {
      customer: { select: { id: true, user: { select: { name: true } } } },
    },
  },
  driver: {
    select: {
      id: true,
      licenseCategory: true,
      phone: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
  vehicle: true,
  assignedBy: { select: { id: true, name: true } },
} satisfies Prisma.DeliveryInclude;

type DeliveryRecord = Prisma.DeliveryGetPayload<{
  include: typeof deliveryInclude;
}>;

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async assign(user: AuthUser, dto: CreateDeliveryDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.deliveryOrder.findUnique({
        where: { id: dto.orderId },
      });
      if (!order) throw new NotFoundException('Pedido não encontrado');

      const driver = await tx.driver.findUnique({
        where: { id: dto.driverId },
      });
      if (!driver) throw new NotFoundException('Motorista não encontrado');

      const vehicle = await tx.vehicle.findUnique({
        where: { id: dto.vehicleId },
      });
      if (!vehicle) throw new NotFoundException('Veículo não encontrado');

      const [driverActive, vehicleActive] = await Promise.all([
        tx.delivery.count({
          where: {
            driverId: driver.id,
            status: { in: ACTIVE_DELIVERY_STATUSES },
          },
        }),
        tx.delivery.count({
          where: {
            vehicleId: vehicle.id,
            status: { in: ACTIVE_DELIVERY_STATUSES },
          },
        }),
      ]);

      const conflicts = findAssignmentConflicts({
        order,
        driver,
        vehicle,
        driverHasActiveDelivery: driverActive > 0,
        vehicleHasActiveDelivery: vehicleActive > 0,
      });
      if (conflicts.length) throw new ConflictException(conflicts.join('; '));

      const delivery = await tx.delivery.create({
        data: {
          orderId: order.id,
          driverId: driver.id,
          vehicleId: vehicle.id,
          assignedById: user.id,
          history: {
            create: {
              fromStatus: null,
              toStatus: DeliveryStatus.ASSIGNED,
              changedById: user.id,
              note: 'Entrega atribuída',
            },
          },
        },
        include: deliveryInclude,
      });

      const scheduled = await tx.deliveryOrder.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: { status: OrderStatus.SCHEDULED },
      });
      if (scheduled.count !== 1) {
        throw new ConflictException(
          'O pedido foi alterado por outra requisição',
        );
      }
      return delivery;
    });
    return this.toView(created, user.role);
  }

  async list(
    user: AuthUser,
    query: ListDeliveriesDto,
    scope: Prisma.DeliveryWhereInput = {},
  ) {
    const where: Prisma.DeliveryWhereInput = {
      AND: [
        this.accessWhere(user),
        scope,
        {
          ...(query.status && { status: query.status }),
          ...(query.orderId && { orderId: query.orderId }),
          ...(query.driverId && { driverId: query.driverId }),
          ...(query.vehicleId && { vehicleId: query.vehicleId }),
        },
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({
        where,
        include: deliveryInclude,
        orderBy: { createdAt: query.order },
        ...pageArgs(query),
      }),
      this.prisma.delivery.count({ where }),
    ]);
    return paginated(
      rows.map((row) => this.toView(row, user.role)),
      total,
      query,
    );
  }

  async findOne(user: AuthUser, id: string) {
    return this.toView(await this.findAccessibleOrFail(user, id), user.role);
  }

  async findAccessibleOrFail(user: AuthUser, id: string) {
    const delivery = await this.prisma.delivery.findFirst({
      where: { id, ...this.accessWhere(user) },
      include: deliveryInclude,
    });
    if (!delivery) throw new NotFoundException('Entrega não encontrada');
    return delivery;
  }

  async history(user: AuthUser, id: string) {
    await this.findAccessibleOrFail(user, id);
    return this.prisma.deliveryStatusHistory.findMany({
      where: { deliveryId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        note: true,
        createdAt: true,
        changedBy: { select: { id: true, name: true, role: true } },
      },
    });
  }

  async updateStatus(user: AuthUser, id: string, dto: UpdateDeliveryStatusDto) {
    const delivery = await this.findAccessibleOrFail(user, id);
    const target = dto.status;

    const allowedTargets =
      user.role === Role.DRIVER
        ? DRIVER_TARGET_STATUSES
        : STAFF_TARGET_STATUSES;
    if (!allowedTargets.includes(target)) {
      throw new ForbiddenException(
        user.role === Role.DRIVER
          ? 'Motoristas não podem cancelar entregas'
          : 'Operadores e administradores só podem cancelar entregas; o avanço de estado é do motorista responsável',
      );
    }

    if (!canTransition(delivery.status, target)) {
      throw new ConflictException(
        `Transição inválida: ${delivery.status} → ${target}`,
      );
    }
    if (target === DeliveryStatus.DELIVERED && !delivery.proofPath) {
      throw new ConflictException(
        'Envie o comprovante de entrega antes de concluir a entrega',
      );
    }
    if (target === DeliveryStatus.FAILED) {
      const occurrences = await this.prisma.occurrence.count({
        where: { deliveryId: id },
      });
      if (occurrences === 0) {
        throw new ConflictException(
          'Registre uma ocorrência antes de marcar a entrega como FAILED',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.delivery.updateMany({
        where: { id, status: delivery.status },
        data: {
          status: target,
          ...(isFinalStatus(target) && { finishedAt: new Date() }),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'A entrega foi alterada por outra requisição. Consulte o estado atual e tente novamente',
        );
      }
      await tx.deliveryOrder.update({
        where: { id: delivery.orderId },
        data: { status: ORDER_STATUS_ON_DELIVERY[target] },
      });
      await tx.deliveryStatusHistory.create({
        data: {
          deliveryId: id,
          fromStatus: delivery.status,
          toStatus: target,
          changedById: user.id,
          note: dto.note,
        },
      });
      return tx.delivery.findUniqueOrThrow({
        where: { id },
        include: deliveryInclude,
      });
    });
    return this.toView(updated, user.role);
  }

  async saveProof(user: AuthUser, id: string, file?: Express.Multer.File) {
    const delivery = await this.findAccessibleOrFail(user, id);
    if (delivery.status !== DeliveryStatus.IN_TRANSIT) {
      throw new ConflictException(
        'O comprovante só pode ser enviado com a entrega em trânsito (IN_TRANSIT)',
      );
    }

    const detected = this.validateFile(file);
    const directory = this.proofDirectory();
    await mkdir(directory, { recursive: true });

    // O nome em disco é sempre gerado pelo servidor: o nome enviado pelo cliente
    // nunca entra no caminho do arquivo (evita path traversal).
    const storedName = `${randomUUID()}.${detected.extension}`;
    await writeFile(join(directory, storedName), file!.buffer);

    try {
      const updated = await this.prisma.delivery.update({
        where: { id },
        data: {
          proofPath: storedName,
          proofOriginalName: this.safeOriginalName(file!.originalname),
          proofMimeType: detected.mime,
          proofSize: file!.size,
          proofUploadedAt: new Date(),
        },
        include: deliveryInclude,
      });
      if (delivery.proofPath) await this.removeStoredFile(delivery.proofPath);
      return this.toView(updated, user.role);
    } catch (error) {
      await this.removeStoredFile(storedName);
      throw error;
    }
  }

  async readProof(user: AuthUser, id: string) {
    const delivery = await this.findAccessibleOrFail(user, id);
    if (!delivery.proofPath) {
      throw new NotFoundException('Esta entrega ainda não possui comprovante');
    }
    const fullPath = join(this.proofDirectory(), basename(delivery.proofPath));
    try {
      await stat(fullPath);
    } catch {
      throw new NotFoundException('Arquivo do comprovante não encontrado');
    }
    return new StreamableFile(createReadStream(fullPath), {
      type: delivery.proofMimeType ?? 'application/octet-stream',
      disposition: `inline; filename="comprovante-${id}${extname(delivery.proofPath)}"`,
    });
  }

  private accessWhere(user: AuthUser): Prisma.DeliveryWhereInput {
    switch (user.role) {
      case Role.CUSTOMER:
        return { order: { customer: { userId: user.id } } };
      case Role.DRIVER:
        return { driver: { userId: user.id } };
      default:
        return {};
    }
  }

  private toView(delivery: DeliveryRecord, role: Role) {
    const {
      proofPath,
      proofOriginalName,
      proofMimeType,
      proofSize,
      proofUploadedAt,
      ...base
    } = delivery;
    const proof = proofPath
      ? {
          originalName: proofOriginalName,
          mimeType: proofMimeType,
          size: proofSize,
          uploadedAt: proofUploadedAt,
        }
      : null;

    if (role === Role.CUSTOMER) {
      return {
        ...base,
        driver: { id: base.driver.id, name: base.driver.user.name },
        vehicle: {
          plate: base.vehicle.plate,
          model: base.vehicle.model,
          type: base.vehicle.type,
        },
        assignedBy: undefined,
        proof,
      };
    }
    return { ...base, proof };
  }

  private validateFile(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'Envie o arquivo no campo "file" (multipart/form-data)',
      );
    }
    if (file.size === 0) throw new BadRequestException('Arquivo vazio');

    const maxSize = this.config.getOrThrow<number>('UPLOAD_MAX_SIZE_BYTES');
    if (file.size > maxSize) {
      throw new PayloadTooLargeException(
        `Arquivo excede o limite de ${Math.floor(maxSize / 1024 / 1024)} MB`,
      );
    }

    const detected = detectFileType(file.buffer);
    if (!detected) {
      throw new BadRequestException(
        'Tipo de arquivo não permitido. Envie JPEG, PNG ou PDF',
      );
    }
    if (file.mimetype !== detected.mime) {
      throw new BadRequestException(
        'O conteúdo do arquivo não corresponde ao tipo declarado',
      );
    }
    return detected;
  }

  private safeOriginalName(name: string) {
    return basename(name)
      .replace(/[^\w.\- ]/g, '_')
      .slice(0, 120);
  }

  private proofDirectory() {
    return resolve(
      process.cwd(),
      this.config.getOrThrow<string>('UPLOAD_DIR'),
      'proofs',
    );
  }

  private async removeStoredFile(storedName: string) {
    await unlink(join(this.proofDirectory(), basename(storedName))).catch(
      () => undefined,
    );
  }
}
