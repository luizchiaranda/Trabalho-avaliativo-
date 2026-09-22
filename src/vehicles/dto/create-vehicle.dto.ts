import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
} from 'class-validator';
import { VehicleType } from '../../generated/prisma/client.js';
import { normalizePlate, trimString } from '../../common/utils/transforms.js';

export const PLATE_PATTERN = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;

export class CreateVehicleDto {
  @Transform(normalizePlate)
  @Matches(PLATE_PATTERN, {
    message: 'plate inválida (use ABC1234 ou ABC1D23)',
  })
  plate: string;

  @Transform(trimString)
  @IsString()
  @Length(2, 80)
  model: string;

  @IsEnum(VehicleType)
  type: VehicleType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100000)
  capacityKg: number;
}
