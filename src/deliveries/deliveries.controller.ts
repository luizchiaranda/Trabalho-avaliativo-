import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { Role } from '../generated/prisma/client.js';
import { DeliveriesService } from './deliveries.service.js';
import { CreateDeliveryDto } from './dto/create-delivery.dto.js';
import { DeliveryHistoryEntryDto } from './dto/delivery-history-response.dto.js';
import { DeliveryResponseDto } from './dto/delivery-response.dto.js';
import { ListDeliveriesDto } from './dto/list-deliveries.dto.js';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto.js';

@ApiTags('Entregas')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Atribui motorista e veículo a um pedido (cria a entrega)',
    description:
      'O pedido precisa estar PENDING. A resposta 409 traz, numa única mensagem, todos os ' +
      'motivos de incompatibilidade (motorista/veículo ocupados, CNH incompatível, peso acima da capacidade, etc.).',
  })
  @ApiCreatedResponse({ type: DeliveryResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @Post()
  assign(@CurrentUser() user: AuthUser, @Body() dto: CreateDeliveryDto) {
    return this.deliveries.assign(user, dto);
  }

  @ApiOperation({
    summary: 'Lista entregas',
    description:
      'CUSTOMER vê as do seu pedido, DRIVER vê as suas, OPERATOR/ADMIN veem todas. ' +
      'Para CUSTOMER, os campos driver/vehicle vêm reduzidos e assignedBy não aparece.',
  })
  @ApiPaginatedResponse(DeliveryResponseDto)
  @ApiErrorResponses(400, 401)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListDeliveriesDto) {
    return this.deliveries.list(user, query);
  }

  @ApiOperation({ summary: 'Detalha uma entrega' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: DeliveryResponseDto })
  @ApiErrorResponses(400, 401, 404)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveries.findOne(user, id);
  }

  @ApiOperation({
    summary: 'Histórico de mudanças de status da entrega',
    description: 'Ordem cronológica; nunca é alterado depois de criado (append-only).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: DeliveryHistoryEntryDto, isArray: true })
  @ApiErrorResponses(400, 401, 404)
  @Get(':id/history')
  history(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveries.history(user, id);
  }

  @Roles(Role.DRIVER, Role.OPERATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Avança ou cancela o status da entrega',
    description:
      'O motorista responsável avança (ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED, ou FAILED). ' +
      'OPERATOR/ADMIN só cancelam. DELIVERED exige comprovante já enviado; FAILED exige uma ocorrência registrada.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: DeliveryResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveries.updateStatus(user, id, dto);
  }

  @Roles(Role.DRIVER)
  @ApiOperation({
    summary: 'Envia o comprovante de entrega',
    description:
      'Somente o motorista responsável, e somente com a entrega em IN_TRANSIT. ' +
      'Aceita JPEG, PNG ou PDF (validado pelo conteúdo real do arquivo, não só pela extensão/Content-Type). ' +
      'Um novo envio substitui o comprovante anterior.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiCreatedResponse({ type: DeliveryResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409, 413)
  @Post(':id/proof')
  @UseInterceptors(FileInterceptor('file'))
  uploadProof(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.deliveries.saveProof(user, id, file);
  }

  @ApiOperation({
    summary: 'Baixa o comprovante de entrega',
    description: 'Devolve o arquivo em stream, com o Content-Type real detectado no upload.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProduces('image/jpeg', 'image/png', 'application/pdf')
  @ApiOkResponse({ description: 'Arquivo do comprovante' })
  @ApiErrorResponses(400, 401, 404)
  @Get(':id/proof')
  downloadProof(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveries.readProof(user, id);
  }
}
