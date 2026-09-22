import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  Matches,
} from 'class-validator';
import { LicenseCategory } from '../../generated/prisma/client.js';
import { onlyDigits } from '../../common/utils/transforms.js';

export class UpdateDriverDto {
  @IsOptional()
  @Transform(onlyDigits)
  @Matches(/^\d{10,11}$/, { message: 'phone deve ter 10 ou 11 dígitos' })
  phone?: string;

  @IsOptional()
  @IsEnum(LicenseCategory)
  licenseCategory?: LicenseCategory;

  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'licenseExpiresAt deve ser uma data ISO (YYYY-MM-DD)' },
  )
  licenseExpiresAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateMyDriverProfileDto {
  @Transform(onlyDigits)
  @Matches(/^\d{10,11}$/, { message: 'phone deve ter 10 ou 11 dígitos' })
  phone: string;
}
