import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_RULE,
  PASSWORD_RULE_MESSAGE,
} from '../../common/utils/password.js';
import {
  normalizeEmail,
  onlyDigits,
  trimString,
} from '../../common/utils/transforms.js';

export class RegisterDto {
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
  @Matches(/^(\d{11}|\d{14})$/, {
    message: 'document deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos)',
  })
  document: string;

  @Transform(onlyDigits)
  @Matches(/^\d{10,11}$/, { message: 'phone deve ter 10 ou 11 dígitos' })
  phone: string;
}
