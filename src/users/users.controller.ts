import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { Role } from '../generated/prisma/client.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Usuários (administração)')
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @ApiOperation({
    summary: 'Cria um usuário OPERATOR ou ADMIN',
    description:
      'Motoristas e clientes não são criados aqui: use POST /drivers ou POST /auth/register.',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiErrorResponses(400, 401, 403, 409)
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @ApiOperation({ summary: 'Lista usuários, com filtro por papel e status' })
  @ApiPaginatedResponse(UserResponseDto)
  @ApiErrorResponses(400, 401, 403)
  @Get()
  findAll(@Query() query: ListUsersDto) {
    return this.users.findAll(query);
  }

  @ApiOperation({ summary: 'Detalha um usuário' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @ApiOperation({
    summary: 'Atualiza nome e/ou ativa/desativa um usuário',
    description: 'Um administrador não pode desativar a própria conta (409).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actor, id, dto);
  }

  @ApiOperation({
    summary: 'Exclui um usuário (e o perfil de cliente/motorista ligado a ele)',
    description:
      'Só é possível se a conta não tem histórico de pedidos, entregas, mudanças de status ' +
      'ou ocorrências (409 caso contrário; use PATCH com active: false). ' +
      'Um administrador não pode excluir a própria conta (409).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Excluído' })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @HttpCode(204)
  @Delete(':id')
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.remove(actor, id);
  }
}
