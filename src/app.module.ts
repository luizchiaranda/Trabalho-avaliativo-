import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { CepModule } from './cep/cep.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ApiKeyGuard } from './common/guards/api-key.guard.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { validateEnv } from './config/env.validation.js';
import { CustomersModule } from './customers/customers.module.js';
import { DeliveriesModule } from './deliveries/deliveries.module.js';
import { DriversModule } from './drivers/drivers.module.js';
import { HealthController } from './health/health.controller.js';
import { OccurrencesModule } from './occurrences/occurrences.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    DriversModule,
    VehiclesModule,
    OrdersModule,
    DeliveriesModule,
    OccurrencesModule,
    CepModule,
  ],
  controllers: [HealthController],
  providers: [
    // Primeira camada: toda requisição precisa da chave de API do serviço
    // que está chamando, antes mesmo de qualquer verificação de usuário/JWT.
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
