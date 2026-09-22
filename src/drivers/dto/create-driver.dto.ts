import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LicenseCategory } from '../../generated/prisma/client.js';
import {
  PASSWORD_RULE,
  PASSWORD_RULE_MESSAGE,
} from '../../common/utils/password.js';
import {
  normalizeEmail,
  onlyDigits,
  trimString,
} from '../../common/utils/transforms.js';

export class CreateDriverDto {
  @Transform(trimString)
  @IsString()
  @Length(2, 120)
  name: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_RULE, { message: PASSWORD_RULE_MESSAGE })
  password: string;

  @Transform(onlyDigits)
  @Matches(/^\d{9,11}$/, {
    message: 'licenseNumber deve ter de 9 a 11 dígitos',
  })
  licenseNumber: string;

  @IsEnum(LicenseCategory)
  licenseCategory: LicenseCategory;

  @IsISO8601(
    { strict: true },
    { message: 'licenseExpiresAt deve ser uma data ISO (YYYY-MM-DD)' },
  )
  licenseExpiresAt: string;

  @Transform(onlyDigits)
  @Matches(/^\d{10,11}$/, { message: 'phone deve ter 10 ou 11 dígitos' })
  phone: string;
}
