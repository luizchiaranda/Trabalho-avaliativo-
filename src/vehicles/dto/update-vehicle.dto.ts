import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
} from 'class-validator';
import { VehicleStatus, VehicleType } from '../../generated/prisma/client.js';
import { normalizePlate, trimString } from '../../common/utils/transforms.js';
import { PLATE_PATTERN } from './create-vehicle.dto.js';

export class UpdateVehicleDto {
  @IsOptional()
  @Transform(normalizePlate)
  @Matches(PLATE_PATTERN, {
    message: 'plate inválida (use ABC1234 ou ABC1D23)',
  })
  plate?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(2, 80)
  model?: string;

  @IsOptional()
  @IsEnum(VehicleType)
  type?: VehicleType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100000)
  capacityKg?: number;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}
