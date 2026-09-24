import { UserResponseDto } from '../../users/dto/user-response.dto.js';

export class CustomerResponseDto {
  id: string;
  userId: string;
  document: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
  user: UserResponseDto;
}
