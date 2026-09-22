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
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { Role } from '../generated/prisma/client.js';
import { DeliveriesService } from './deliveries.service.js';
import { CreateDeliveryDto } from './dto/create-delivery.dto.js';
import { ListDeliveriesDto } from './dto/list-deliveries.dto.js';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto.js';

@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Roles(Role.OPERATOR, Role.ADMIN)
  @Post()
  assign(@CurrentUser() user: AuthUser, @Body() dto: CreateDeliveryDto) {
    return this.deliveries.assign(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListDeliveriesDto) {
    return this.deliveries.list(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveries.findOne(user, id);
  }

  @Get(':id/history')
  history(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveries.history(user, id);
  }

  @Roles(Role.DRIVER, Role.OPERATOR, Role.ADMIN)
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveries.updateStatus(user, id, dto);
  }

  @Roles(Role.DRIVER)
  @Post(':id/proof')
  @UseInterceptors(FileInterceptor('file'))
  uploadProof(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.deliveries.saveProof(user, id, file);
  }

  @Get(':id/proof')
  downloadProof(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveries.readProof(user, id);
  }
}
