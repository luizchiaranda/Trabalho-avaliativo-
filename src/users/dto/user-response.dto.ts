import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client.js';

/** Espelha publicUserSelect (src/common/utils/selects.ts): nunca inclui a senha. */
export class UserResponseDto {
  id: string;
  name: string;
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;

  active: boolean;
  createdAt: Date;
}
