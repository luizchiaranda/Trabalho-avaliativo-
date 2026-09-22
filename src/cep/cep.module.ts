import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CepController } from './cep.controller.js';
import { CepService } from './cep.service.js';

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseURL: config.getOrThrow<string>('CEP_API_BASE_URL'),
        timeout: config.getOrThrow<number>('CEP_API_TIMEOUT_MS'),
        maxRedirects: 0,
      }),
    }),
  ],
  controllers: [CepController],
  providers: [CepService],
  exports: [CepService],
})
export class CepModule {}
