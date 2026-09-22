import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { startCepMock, type CepMock } from './cep-mock.js';

export interface TestApp {
  app: INestApplication<Server>;
  prisma: PrismaService;
  cepMock: CepMock;
  server: Server;
  close: () => Promise<void>;
}

/**
 * A URL do mock de CEP (http://127.0.0.1:4010) vem de `test.env` no vitest.config.e2e.ts.
 * Precisa ser definida antes do import do AppModule, porque o ConfigModule lê o ambiente
 * no momento em que o módulo é carregado.
 */
export async function createTestApp(): Promise<TestApp> {
  const cepMock = await startCepMock();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<Server>>({
    logger: false,
  });
  configureApp(app);
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    cepMock,
    server: app.getHttpServer(),
    close: async () => {
      await app.close();
      await cepMock.close();
    },
  };
}

export async function resetDatabase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE occurrences, delivery_status_history, deliveries, delivery_orders, vehicles, drivers, customers, users RESTART IDENTITY CASCADE',
  );
}
