import type { Role } from '../../generated/prisma/client.js';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
