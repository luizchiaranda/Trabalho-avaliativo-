import { ApiProperty } from '@nestjs/swagger';
import { VehicleStatus, VehicleType } from '../../generated/prisma/client.js';

export class VehicleResponseDto {
  id: string;
  plate: string;
  model: string;

  @ApiProperty({ enum: VehicleType })
  type: VehicleType;

  capacityKg: number;

  @ApiProperty({ enum: VehicleStatus })
  status: VehicleStatus;

  createdAt: Date;
  updatedAt: Date;
}
