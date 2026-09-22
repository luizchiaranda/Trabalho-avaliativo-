import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { onlyDigits, trimString } from '../../common/utils/transforms.js';

export class UpdateMyCustomerProfileDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @Transform(onlyDigits)
  @Matches(/^\d{10,11}$/, { message: 'phone deve ter 10 ou 11 dígitos' })
  phone?: string;
}
