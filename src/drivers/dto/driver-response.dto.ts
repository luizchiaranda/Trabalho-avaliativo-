import { ApiProperty } from '@nestjs/swagger';
import { LicenseCategory } from '../../generated/prisma/client.js';
import { UserResponseDto } from '../../users/dto/user-response.dto.js';

export class DriverResponseDto {
  id: string;
  userId: string;
  licenseNumber: string;

  @ApiProperty({ enum: LicenseCategory })
  licenseCategory: LicenseCategory;

  licenseExpiresAt: Date;
  phone: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: UserResponseDto;
}
