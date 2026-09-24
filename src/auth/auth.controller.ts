import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { AuthService } from './auth.service.js';
import {
  LoginResponseDto,
  MeResponseDto,
  RegisterResponseDto,
} from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @ApiSecurity('ApiKey')
  @ApiOperation({
    summary: 'Cadastra um novo cliente (papel CUSTOMER)',
    description:
      'Cria o User e o Customer numa transação. Não é possível se cadastrar como outro papel: ' +
      'campos fora do DTO (como "role") são rejeitados com 400 (mass assignment).',
  })
  @ApiCreatedResponse({ type: RegisterResponseDto })
  @ApiErrorResponses(400, 401, 409)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @ApiSecurity('ApiKey')
  @ApiOperation({
    summary: 'Login',
    description:
      'Devolve o JWT a ser usado em Authorization: Bearer <token>. ' +
      'E-mail inexistente e senha errada devolvem a mesma mensagem 401, para não revelar quais contas existem.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiErrorResponses(400, 401)
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
  @ApiOperation({ summary: 'Dados do usuário autenticado (e seu perfil)' })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiErrorResponses(401)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
