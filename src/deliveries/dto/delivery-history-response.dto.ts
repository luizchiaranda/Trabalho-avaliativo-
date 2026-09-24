import { ApiProperty } from '@nestjs/swagger';
import { DeliveryStatus, Role } from '../../generated/prisma/client.js';

export class DeliveryHistoryChangedByDto {
  id: string;
  name: string;

  @ApiProperty({ enum: Role })
  role: Role;
}

export class DeliveryHistoryEntryDto {
  id: string;

  @ApiProperty({ enum: DeliveryStatus, nullable: true, required: false })
  fromStatus: DeliveryStatus | null;

  @ApiProperty({ enum: DeliveryStatus })
  toStatus: DeliveryStatus;

  @ApiProperty({ required: false, nullable: true })
  note: string | null;

  createdAt: Date;
  changedBy: DeliveryHistoryChangedByDto;
}
