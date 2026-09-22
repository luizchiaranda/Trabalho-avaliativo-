import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { DriversController } from './drivers.controller.js';
import { DriversService } from './drivers.service.js';

@Module({
  imports: [DeliveriesModule],
  controllers: [DriversController],
  providers: [DriversService],
})
export class DriversModule {}
