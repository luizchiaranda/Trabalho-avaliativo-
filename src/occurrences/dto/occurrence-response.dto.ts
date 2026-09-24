import { ApiProperty } from '@nestjs/swagger';
import { OccurrenceType, Role } from '../../generated/prisma/client.js';

export class OccurrenceReportedByDto {
  id: string;
  name: string;

  @ApiProperty({ enum: Role })
  role: Role;
}

export class OccurrenceResponseDto {
  id: string;
  deliveryId: string;

  @ApiProperty({ enum: OccurrenceType })
  type: OccurrenceType;

  description: string;
  createdAt: Date;
  reportedBy: OccurrenceReportedByDto;
}
