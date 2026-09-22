import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { paginated, pageArgs } from '../common/dto/pagination-query.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { hashPassword } from '../common/utils/password.js';
import { publicUserSelect } from '../common/utils/selects.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { ListUsersDto } from './dto/list-users.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
        role: dto.role,
      },
      select: publicUserSelect,
    });
  }

  async findAll(query: ListUsersDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.role && { role: query.role }),
      ...(query.active !== undefined && { active: query.active }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: publicUserSelect,
        orderBy: { createdAt: query.order },
        ...pageArgs(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    if (dto.active === false && actor.id === id) {
      throw new ConflictException('Você não pode desativar a própria conta');
    }
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: publicUserSelect,
    });
  }
}
