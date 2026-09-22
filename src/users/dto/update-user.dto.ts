import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { trimString } from '../../common/utils/transforms.js';

export class UpdateUserDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
