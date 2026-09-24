import { ApiProperty } from '@nestjs/swagger';
import {
  DeliveryStatus,
  LicenseCategory,
  OrderStatus,
} from '../../generated/prisma/client.js';
import { VehicleResponseDto } from '../../vehicles/dto/vehicle-response.dto.js';

export class DeliveryOrderCustomerUserDto {
  name: string;
}

export class DeliveryOrderCustomerDto {
  id: string;
  user: DeliveryOrderCustomerUserDto;
}

/** Pedido aninhado na entrega: todos os campos de DeliveryOrder + o cliente resumido. */
export class DeliveryOrderNestedDto {
  id: string;
  customerId: string;
  description: string;
  weightKg: number;
  originCep: string;
  originStreet: string;
  originNumber: string;

  @ApiProperty({ required: false, nullable: true })
  originComplement?: string | null;

  originNeighborhood: string;
  originCity: string;
  originState: string;
  destinationCep: string;
  destinationStreet: string;
  destinationNumber: string;

  @ApiProperty({ required: false, nullable: true })
  destinationComplement?: string | null;

  destinationNeighborhood: string;
  destinationCity: string;
  destinationState: string;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  createdAt: Date;
  updatedAt: Date;
  customer: DeliveryOrderCustomerDto;
}

export class DeliveryDriverUserDto {
  id: string;
  name: string;
  email: string;
}

/** Visão do motorista para OPERATOR/ADMIN/DRIVER. Para CUSTOMER, a API reduz para { id, name }. */
export class DeliveryDriverSummaryDto {
  id: string;

  @ApiProperty({ enum: LicenseCategory })
  licenseCategory: LicenseCategory;

  phone: string;
  user: DeliveryDriverUserDto;
}

export class DeliveryAssignedByDto {
  id: string;
  name: string;
}

export class DeliveryProofDto {
  @ApiProperty({ required: false, nullable: true })
  originalName: string | null;

  @ApiProperty({ required: false, nullable: true })
  mimeType: string | null;

  @ApiProperty({ required: false, nullable: true })
  size: number | null;

  @ApiProperty({ required: false, nullable: true })
  uploadedAt: Date | null;
}

/**
 * Visão completa (OPERATOR/ADMIN/DRIVER). Quando o solicitante é CUSTOMER, a
 * API devolve o mesmo formato, mas com `driver` reduzido a { id, name },
 * `vehicle` reduzido a { plate, model, type } e sem o campo `assignedBy`
 * (ver DeliveriesService.toView) — dados sensíveis do motorista não são
 * expostos ao cliente.
 */
export class DeliveryResponseDto {
  id: string;
  orderId: string;
  driverId: string;
  vehicleId: string;
  assignedById: string;

  @ApiProperty({ enum: DeliveryStatus })
  status: DeliveryStatus;

  @ApiProperty({ required: false, nullable: true })
  finishedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
  order: DeliveryOrderNestedDto;
  driver: DeliveryDriverSummaryDto;
  vehicle: VehicleResponseDto;

  @ApiProperty({ required: false })
  assignedBy?: DeliveryAssignedByDto;

  @ApiProperty({ type: DeliveryProofDto, nullable: true })
  proof: DeliveryProofDto | null;
}
