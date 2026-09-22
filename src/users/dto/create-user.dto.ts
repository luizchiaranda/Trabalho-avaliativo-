import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../generated/prisma/client.js';
import {
  PASSWORD_RULE,
  PASSWORD_RULE_MESSAGE,
} from '../../common/utils/password.js';
import { normalizeEmail, trimString } from '../../common/utils/transforms.js';

export class CreateUserDto {
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

  @IsIn([Role.OPERATOR, Role.ADMIN], {
    message:
      'role deve ser OPERATOR ou ADMIN (motoristas e clientes têm rotas próprias)',
  })
  role: 'OPERATOR' | 'ADMIN';
}
