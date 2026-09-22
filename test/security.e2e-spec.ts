import { Logger } from '@nestjs/common';
import { Role } from '../src/generated/prisma/client.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/app.js';
import {
  api,
  TEST_PASSWORD,
  assignDelivery,
  bearer,
  createActor,
  createOrder,
  createVehicle,
  type Actor,
} from './helpers/factories.js';

describe('Segurança, performance e Interceptor', () => {
  let ctx: TestApp;
  let admin: Actor;
  let operator: Actor;
  let customer: Actor;
  let driver: Actor;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    admin = await createActor(ctx, Role.ADMIN);
    operator = await createActor(ctx, Role.OPERATOR);
    customer = await createActor(ctx, Role.CUSTOMER);
    driver = await createActor(ctx, Role.DRIVER);
  });

  afterAll(() => ctx.close());

  describe('Helmet', () => {
    it('envia cabeçalhos de segurança e esconde X-Powered-By', async () => {
      const response = await api(ctx.server).get('/health').expect(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Compression', () => {
    it('comprime respostas grandes quando o cliente aceita gzip', async () => {
      for (let i = 0; i < 12; i++) await createVehicle(ctx.prisma);
      const response = await api(ctx.server)
        .get('/vehicles?limit=100')
        .set(bearer(operator.token))
        .set('Accept-Encoding', 'gzip')
        .expect(200);
      expect(response.headers['content-encoding']).toBe('gzip');
      expect(response.body.data.length).toBeGreaterThanOrEqual(12);
    });

    it('não comprime quando o cliente não aceita', async () => {
      const response = await api(ctx.server)
        .get('/vehicles?limit=100')
        .set(bearer(operator.token))
        .set('Accept-Encoding', 'identity')
        .expect(200);
      expect(response.headers['content-encoding']).toBeUndefined();
    });
  });

  describe('Dados sensíveis nunca aparecem nas respostas', () => {
    it('varredura de respostas de todos os recursos', async () => {
      const vehicle = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);
      const delivery = await assignDelivery(ctx, operator, {
        orderId: order.id,
        driverId: driver.driverId!,
        vehicleId: vehicle.id,
      }).then((r) => r.body);

      const probes: Array<[string, Actor]> = [
        ['/auth/me', admin],
        ['/users', admin],
        [`/users/${customer.userId}`, admin],
        ['/customers', operator],
        [`/customers/${customer.customerId}`, operator],
        ['/customers/me', customer],
        ['/drivers', operator],
        [`/drivers/${driver.driverId}`, operator],
        ['/drivers/me', driver],
        ['/orders', customer],
        ['/deliveries', operator],
        ['/deliveries', customer],
        ['/deliveries', driver],
        [`/deliveries/${delivery.id}/history`, customer],
      ];

      for (const [path, actor] of probes) {
        const response = await api(ctx.server)
          .get(path)
          .set(bearer(actor.token))
          .expect(200);
        const body = JSON.stringify(response.body);
        expect(body, path).not.toMatch(
          /passwordHash|"password"|\$2[aby]\$\d{2}\$/,
        );
      }
    });

    it('respostas de escrita (cadastro de usuário e motorista) também não vazam a senha', async () => {
      const user = await api(ctx.server)
        .post('/users')
        .set(bearer(admin.token))
        .send({
          name: 'Novo Operador',
          email: 'novo.op@x.com',
          password: TEST_PASSWORD,
          role: 'OPERATOR',
        })
        .expect(201);
      const driverResponse = await api(ctx.server)
        .post('/drivers')
        .set(bearer(operator.token))
        .send({
          name: 'Novo Motorista',
          email: 'novo.mot@x.com',
          password: TEST_PASSWORD,
          licenseNumber: '55544433322',
          licenseCategory: 'B',
          licenseExpiresAt: '2033-03-03',
          phone: '11955554444',
        })
        .expect(201);
      for (const body of [user.body, driverResponse.body]) {
        expect(JSON.stringify(body)).not.toMatch(
          /passwordHash|"password"|Senha@1234|\$2[aby]\$/,
        );
      }
    });

    it('a senha é armazenada com hash bcrypt, nunca em texto', async () => {
      const stored = await ctx.prisma.user.findUniqueOrThrow({
        where: { email: 'novo.op@x.com' },
      });
      expect(stored.passwordHash).toMatch(/^\$2[aby]\$10\$/);
      expect(stored.passwordHash).not.toContain(TEST_PASSWORD);
    });
  });

  describe('Interceptor de log estruturado', () => {
    it('devolve X-Request-Id e X-Response-Time', async () => {
      const response = await api(ctx.server).get('/health').expect(200);
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(response.headers['x-response-time']).toMatch(/^\d+(\.\d+)?ms$/);
    });

    it('reaproveita o X-Request-Id seguro enviado pelo cliente e descarta o perigoso', async () => {
      const safe = await api(ctx.server)
        .get('/health')
        .set('X-Request-Id', 'trace-abc-123');
      expect(safe.headers['x-request-id']).toBe('trace-abc-123');

      const unsafe = await api(ctx.server)
        .get('/health')
        .set('X-Request-Id', 'a b<script>');
      expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('registra método, rota, status, duração e usuário, sem segredos', async () => {
      const lines: string[] = [];
      const spy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation((message: unknown) => {
          lines.push(String(message));
        });

      await api(ctx.server)
        .post('/auth/login')
        .send({ email: customer.email, password: TEST_PASSWORD })
        .expect(200);
      await api(ctx.server)
        .get('/orders?status=PENDING')
        .set(bearer(customer.token))
        .expect(200);
      spy.mockRestore();

      const entries = lines
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(entries.length).toBeGreaterThanOrEqual(2);

      const orders = entries.find((e) => e.path === '/orders')!;
      expect(orders).toMatchObject({
        method: 'GET',
        statusCode: 200,
        userId: customer.userId,
      });
      expect(typeof orders.durationMs).toBe('number');
      expect(typeof orders.requestId).toBe('string');

      const joined = lines.join('\n');
      expect(joined).not.toContain(TEST_PASSWORD);
      expect(joined).not.toContain(customer.token);
      expect(orders.path).toBe('/orders');
      expect(joined).not.toContain('status=PENDING');
      expect(joined.toLowerCase()).not.toContain('authorization');
    });

    it('registra também requisições que terminam em erro', async () => {
      const lines: string[] = [];
      const spy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation((message: unknown) => {
          lines.push(String(message));
        });
      await api(ctx.server)
        .get('/orders/00000000-0000-4000-8000-000000000001')
        .set(bearer(customer.token))
        .expect(404);
      spy.mockRestore();

      const entry = lines
        .map((l) => JSON.parse(l) as Record<string, unknown>)
        .find((e) => e.statusCode === 404);
      expect(entry).toBeDefined();
    });
  });

  describe('Formato padronizado de erro', () => {
    it('todos os erros seguem { statusCode, error, message, path, timestamp }', async () => {
      const cases = [
        () => api(ctx.server).get('/orders'),
        () => api(ctx.server).post('/auth/login').send({}),
        () =>
          api(ctx.server)
            .get('/rota-que-nao-existe')
            .set(bearer(customer.token)),
        () => api(ctx.server).get('/vehicles').set(bearer(customer.token)),
      ];
      for (const send of cases) {
        const response = await send();
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(Object.keys(response.body).sort()).toEqual([
          'error',
          'message',
          'path',
          'statusCode',
          'timestamp',
        ]);
        expect(response.body.statusCode).toBe(response.status);
      }
    });
  });
});
