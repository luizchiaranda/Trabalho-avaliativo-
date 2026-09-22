import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DeliveryStatus } from '../../generated/prisma/client.js';
import { trimString } from '../../common/utils/transforms.js';

export class UpdateDeliveryStatusDto {
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  note?: string;
}
