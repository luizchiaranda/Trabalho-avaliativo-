import { Role } from '../src/generated/prisma/client.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/app.js';
import {
  api,
  PNG_BYTES,
  assignDelivery,
  bearer,
  createActor,
  createOrder,
  createVehicle,
  orderPayload,
  type Actor,
} from './helpers/factories.js';

const RANDOM_UUID = '00000000-0000-4000-8000-000000000001';

describe('Autorização', () => {
  let ctx: TestApp;
  let admin: Actor;
  let operator: Actor;
  let customerA: Actor;
  let customerB: Actor;
  let driverA: Actor;
  let driverB: Actor;
  let orderA: { id: string };
  let deliveryA: { id: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    admin = await createActor(ctx, Role.ADMIN);
    operator = await createActor(ctx, Role.OPERATOR);
    customerA = await createActor(ctx, Role.CUSTOMER);
    customerB = await createActor(ctx, Role.CUSTOMER);
    driverA = await createActor(ctx, Role.DRIVER);
    driverB = await createActor(ctx, Role.DRIVER);

    const vehicle = await createVehicle(ctx.prisma);
    orderA = await createOrder(ctx, customerA);
    deliveryA = await assignDelivery(ctx, operator, {
      orderId: orderA.id,
      driverId: driverA.driverId!,
      vehicleId: vehicle.id,
    }).then((r) => r.body);
  });

  afterAll(() => ctx.close());

  describe('403 - papel sem permissão (matriz de permissões)', () => {
    const cases: Array<
      [string, () => Actor, 'get' | 'post' | 'patch', string, object?]
    > = [
      ['CUSTOMER lista veículos', () => customerA, 'get', '/vehicles'],
      [
        'CUSTOMER cria veículo',
        () => customerA,
        'post',
        '/vehicles',
        { plate: 'AAA1A11', model: 'X', type: 'CAR', capacityKg: 1 },
      ],
      ['CUSTOMER lista motoristas', () => customerA, 'get', '/drivers'],
      ['CUSTOMER lista usuários', () => customerA, 'get', '/users'],
      ['CUSTOMER lista clientes', () => customerA, 'get', '/customers'],
      [
        'CUSTOMER atribui entrega',
        () => customerA,
        'post',
        '/deliveries',
        { orderId: RANDOM_UUID, driverId: RANDOM_UUID, vehicleId: RANDOM_UUID },
      ],
      [
        'CUSTOMER altera status',
        () => customerA,
        'patch',
        `/deliveries/${RANDOM_UUID}/status`,
        { status: 'CANCELLED' },
      ],
      [
        'CUSTOMER registra ocorrência',
        () => customerA,
        'post',
        `/deliveries/${RANDOM_UUID}/occurrences`,
        { type: 'OTHER', description: 'teste' },
      ],
      ['DRIVER cria pedido', () => driverA, 'post', '/orders', orderPayload()],
      ['DRIVER lista pedidos', () => driverA, 'get', '/orders'],
      ['DRIVER lista veículos', () => driverA, 'get', '/vehicles'],
      [
        'DRIVER atribui entrega',
        () => driverA,
        'post',
        '/deliveries',
        { orderId: RANDOM_UUID, driverId: RANDOM_UUID, vehicleId: RANDOM_UUID },
      ],
      ['DRIVER lê perfil de cliente', () => driverA, 'get', '/customers/me'],
      [
        'OPERATOR cria usuário',
        () => operator,
        'post',
        '/users',
        { name: 'X', email: 'x@x.com', password: 'Senha@1234', role: 'ADMIN' },
      ],
      ['OPERATOR lista usuários', () => operator, 'get', '/users'],
      [
        'OPERATOR envia comprovante',
        () => operator,
        'post',
        `/deliveries/${RANDOM_UUID}/proof`,
      ],
      [
        'ADMIN envia comprovante',
        () => admin,
        'post',
        `/deliveries/${RANDOM_UUID}/proof`,
      ],
    ];

    it.each(cases)('%s', async (_label, actor, method, path, body) => {
      const req = api(ctx.server)[method](path).set(bearer(actor().token));
      const response = await (body ? req.send(body) : req);
      expect(response.status).toBe(403);
      expect(response.body.statusCode).toBe(403);
    });

    it('OPERATOR só pode cancelar entregas, não avançar o estado', async () => {
      const response = await api(ctx.server)
        .patch(`/deliveries/${deliveryA.id}/status`)
        .set(bearer(operator.token))
        .send({ status: 'PICKED_UP' });
      expect(response.status).toBe(403);
    });

    it('DRIVER não pode cancelar entrega', async () => {
      const response = await api(ctx.server)
        .patch(`/deliveries/${deliveryA.id}/status`)
        .set(bearer(driverA.token))
        .send({ status: 'CANCELLED' });
      expect(response.status).toBe(403);
    });

    it('perfis permitidos continuam funcionando (controle positivo)', async () => {
      await api(ctx.server)
        .get('/vehicles')
        .set(bearer(operator.token))
        .expect(200);
      await api(ctx.server).get('/users').set(bearer(admin.token)).expect(200);
      await api(ctx.server)
        .get('/orders')
        .set(bearer(customerA.token))
        .expect(200);
      await api(ctx.server)
        .get('/drivers/me')
        .set(bearer(driverA.token))
        .expect(200);
    });
  });

  describe('recursos de terceiros (IDs manipulados na requisição)', () => {
    it('cliente B não enxerga o pedido do cliente A (404, sem revelar existência)', async () => {
      const response = await api(ctx.server)
        .get(`/orders/${orderA.id}`)
        .set(bearer(customerB.token));
      expect(response.status).toBe(404);
    });

    it('listagem do cliente B nunca contém pedidos do cliente A, mesmo filtrando pelo ID dele', async () => {
      const list = await api(ctx.server)
        .get(`/orders?customerId=${customerA.customerId}`)
        .set(bearer(customerB.token))
        .expect(200);
      expect(list.body.data).toHaveLength(0);
      expect(list.body.meta.total).toBe(0);
    });

    it('cliente B não cancela o pedido do cliente A', async () => {
      const response = await api(ctx.server)
        .post(`/orders/${orderA.id}/cancel`)
        .set(bearer(customerB.token));
      expect(response.status).toBe(404);
    });

    it('cliente B não vê entregas, histórico, ocorrências nem comprovante do cliente A', async () => {
      for (const path of [
        `/deliveries/${deliveryA.id}`,
        `/deliveries/${deliveryA.id}/history`,
        `/deliveries/${deliveryA.id}/occurrences`,
        `/deliveries/${deliveryA.id}/proof`,
        `/orders/${orderA.id}/deliveries`,
      ]) {
        const response = await api(ctx.server)
          .get(path)
          .set(bearer(customerB.token));
        expect(response.status, path).toBe(404);
      }
      const list = await api(ctx.server)
        .get('/deliveries')
        .set(bearer(customerB.token))
        .expect(200);
      expect(list.body.data).toHaveLength(0);
    });

    it('cliente não cria pedido em nome de outro cliente (403), mas pode informar o próprio ID', async () => {
      const forged = await api(ctx.server)
        .post('/orders')
        .set(bearer(customerB.token))
        .send(orderPayload({ customerId: customerA.customerId }));
      expect(forged.status).toBe(403);

      const own = await api(ctx.server)
        .post('/orders')
        .set(bearer(customerB.token))
        .send(orderPayload({ customerId: customerB.customerId }));
      expect(own.status).toBe(201);
      expect(own.body.customerId).toBe(customerB.customerId);
    });

    it('operador precisa informar o cliente ao criar pedido, e o cliente precisa existir', async () => {
      const missing = await api(ctx.server)
        .post('/orders')
        .set(bearer(operator.token))
        .send(orderPayload());
      expect(missing.status).toBe(400);

      const ghost = await api(ctx.server)
        .post('/orders')
        .set(bearer(operator.token))
        .send(orderPayload({ customerId: RANDOM_UUID }));
      expect(ghost.status).toBe(404);

      const ok = await api(ctx.server)
        .post('/orders')
        .set(bearer(operator.token))
        .send(orderPayload({ customerId: customerA.customerId }));
      expect(ok.status).toBe(201);
    });

    it('motorista B não vê nem altera a entrega do motorista A', async () => {
      const read = await api(ctx.server)
        .get(`/deliveries/${deliveryA.id}`)
        .set(bearer(driverB.token));
      expect(read.status).toBe(404);

      const update = await api(ctx.server)
        .patch(`/deliveries/${deliveryA.id}/status`)
        .set(bearer(driverB.token))
        .send({ status: 'PICKED_UP' });
      expect(update.status).toBe(404);

      const upload = await api(ctx.server)
        .post(`/deliveries/${deliveryA.id}/proof`)
        .set(bearer(driverB.token))
        .attach('file', PNG_BYTES, {
          filename: 'x.png',
          contentType: 'image/png',
        });
      expect(upload.status).toBe(404);

      const occurrence = await api(ctx.server)
        .post(`/deliveries/${deliveryA.id}/occurrences`)
        .set(bearer(driverB.token))
        .send({ type: 'OTHER', description: 'tentativa indevida' });
      expect(occurrence.status).toBe(404);

      const list = await api(ctx.server)
        .get('/deliveries')
        .set(bearer(driverB.token))
        .expect(200);
      expect(list.body.data).toHaveLength(0);
    });

    it('o motorista responsável e o cliente dono conseguem acessar (controle positivo)', async () => {
      await api(ctx.server)
        .get(`/deliveries/${deliveryA.id}`)
        .set(bearer(driverA.token))
        .expect(200);
      await api(ctx.server)
        .get(`/deliveries/${deliveryA.id}`)
        .set(bearer(customerA.token))
        .expect(200);
      await api(ctx.server)
        .get(`/deliveries/${deliveryA.id}`)
        .set(bearer(operator.token))
        .expect(200);
    });

    it('o cliente não recebe dados sensíveis do motorista (CNH, e-mail, telefone)', async () => {
      const response = await api(ctx.server)
        .get(`/deliveries/${deliveryA.id}`)
        .set(bearer(customerA.token))
        .expect(200);
      expect(Object.keys(response.body.driver).sort()).toEqual(['id', 'name']);
      expect(response.body.assignedBy).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toMatch(
        /licenseNumber|@teste\.com/,
      );
    });

    it('/me devolve somente a identidade do token', async () => {
      const a = await api(ctx.server)
        .get('/customers/me')
        .set(bearer(customerA.token))
        .expect(200);
      const b = await api(ctx.server)
        .get('/customers/me')
        .set(bearer(customerB.token))
        .expect(200);
      expect(a.body.id).toBe(customerA.customerId);
      expect(b.body.id).toBe(customerB.customerId);
    });

    it('não é possível alterar papel ou dados de outro usuário pelo /me', async () => {
      const response = await api(ctx.server)
        .patch('/customers/me')
        .set(bearer(customerA.token))
        .send({ role: 'ADMIN', userId: customerB.userId });
      expect(response.status).toBe(400);
    });
  });
});
