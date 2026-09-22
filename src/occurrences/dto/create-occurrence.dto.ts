import { Transform } from 'class-transformer';
import { IsEnum, IsString, Length } from 'class-validator';
import { OccurrenceType } from '../../generated/prisma/client.js';
import { trimString } from '../../common/utils/transforms.js';

export class CreateOccurrenceDto {
  @IsEnum(OccurrenceType)
  type: OccurrenceType;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  description: string;
}
