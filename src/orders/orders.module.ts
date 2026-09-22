import { Module } from '@nestjs/common';
import { CepModule } from '../cep/cep.module.js';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [CepModule, DeliveriesModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
