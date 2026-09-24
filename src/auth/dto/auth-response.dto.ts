import { ApiProperty } from '@nestjs/swagger';
import { LicenseCategory, Role } from '../../generated/prisma/client.js';

export class LoginUserDto {
  id: string;
  name: string;
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT a enviar em Authorization: Bearer <token>' })
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: string;

  @ApiProperty({ example: '1h', description: 'Valor de JWT_EXPIRES_IN' })
  expiresIn: string;

  user: LoginUserDto;
}

export class AuthCustomerSummaryDto {
  id: string;
  document: string;
  phone: string;
}

export class AuthDriverSummaryDto {
  id: string;
  licenseNumber: string;

  @ApiProperty({ enum: LicenseCategory })
  licenseCategory: LicenseCategory;

  licenseExpiresAt: Date;
  phone: string;
  active: boolean;
}

export class RegisterResponseDto {
  id: string;
  name: string;
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;

  active: boolean;
  createdAt: Date;
  customer: AuthCustomerSummaryDto;
}

export class MeResponseDto {
  id: string;
  name: string;
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;

  active: boolean;
  createdAt: Date;

  @ApiProperty({
    type: AuthCustomerSummaryDto,
    required: false,
    nullable: true,
    description: 'Presente apenas quando role = CUSTOMER',
  })
  customer?: AuthCustomerSummaryDto;

  @ApiProperty({
    type: AuthDriverSummaryDto,
    required: false,
    nullable: true,
    description: 'Presente apenas quando role = DRIVER',
  })
  driver?: AuthDriverSummaryDto;
}
