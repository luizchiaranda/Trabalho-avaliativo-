import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../../generated/prisma/client.js';

export class OrderCustomerUserDto {
  name: string;
  email: string;
}

export class OrderCustomerSummaryDto {
  id: string;
  phone: string;
  user: OrderCustomerUserDto;
}

export class OrderResponseDto {
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
  customer: OrderCustomerSummaryDto;
}
