import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';
import {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
} from '../common/utils/password.js';
import { publicUserSelect } from '../common/utils/selects.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPasswordSync(randomUUID());

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
        role: Role.CUSTOMER,
        customer: { create: { document: dto.document, phone: dto.phone } },
      },
      select: {
        ...publicUserSelect,
        customer: { select: { id: true, document: true, phone: true } },
      },
    });
    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Compara contra um hash falso quando o e-mail não existe, para que o
    // tempo de resposta não revele se a conta existe.
    const passwordOk = await verifyPassword(
      dto.password,
      user?.passwordHash ?? this.dummyHash,
    );
    if (!user || !passwordOk || !user.active) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.getOrThrow<string>('JWT_EXPIRES_IN'),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async me(authUser: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        ...publicUserSelect,
        customer: { select: { id: true, document: true, phone: true } },
        driver: {
          select: {
            id: true,
            licenseNumber: true,
            licenseCategory: true,
            licenseExpiresAt: true,
            phone: true,
            active: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }
}
