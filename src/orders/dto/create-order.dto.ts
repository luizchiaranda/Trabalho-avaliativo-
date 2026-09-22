import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { onlyDigits, trimString } from '../../common/utils/transforms.js';

export class AddressInputDto {
  @Transform(onlyDigits)
  @Matches(/^\d{8}$/, { message: 'cep deve conter 8 dígitos' })
  cep: string;

  @Transform(trimString)
  @IsString()
  @Length(1, 20)
  number: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(80)
  complement?: string;
}

export class CreateOrderDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @Transform(trimString)
  @IsString()
  @Length(3, 255)
  description: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.01)
  @Max(100000)
  weightKg: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => AddressInputDto)
  origin: AddressInputDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => AddressInputDto)
  destination: AddressInputDto;
}
