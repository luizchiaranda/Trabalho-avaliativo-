import {
  LicenseCategory,
  Role,
  VehicleType,
} from '../src/generated/prisma/client.js';
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

describe('Regras de negócio', () => {
  let ctx: TestApp;
  let admin: Actor;
  let operator: Actor;
  let customer: Actor;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    admin = await createActor(ctx, Role.ADMIN);
    operator = await createActor(ctx, Role.OPERATOR);
    customer = await createActor(ctx, Role.CUSTOMER);
  });

  afterAll(() => ctx.close());

  const assign = (orderId: string, driverId: string, vehicleId: string) =>
    assignDelivery(ctx, operator, { orderId, driverId, vehicleId });

  describe('404 - referências inexistentes', () => {
    it('atribuição com pedido, motorista ou veículo inexistente', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const vehicle = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);

      expect(
        (await assign(RANDOM_UUID, driver.driverId!, vehicle.id)).status,
      ).toBe(404);
      expect((await assign(order.id, RANDOM_UUID, vehicle.id)).status).toBe(
        404,
      );
      expect(
        (await assign(order.id, driver.driverId!, RANDOM_UUID)).status,
      ).toBe(404);
    });

    it.each([
      '/orders',
      '/vehicles',
      '/drivers',
      '/customers',
      '/deliveries',
      '/users',
    ])('GET %s/:id inexistente', async (base) => {
      const response = await api(ctx.server)
        .get(`${base}/${RANDOM_UUID}`)
        .set(bearer(admin.token));
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        statusCode: 404,
        error: 'Not Found',
        path: `${base}/${RANDOM_UUID}`,
      });
    });

    it('registrar ocorrência em entrega inexistente', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const response = await api(ctx.server)
        .post(`/deliveries/${RANDOM_UUID}/occurrences`)
        .set(bearer(driver.token))
        .send({ type: 'OTHER', description: 'não existe' });
      expect(response.status).toBe(404);
    });
  });

  describe('400 - validação de entrada', () => {
    it('ID que não é UUID', async () => {
      const response = await api(ctx.server)
        .get('/orders/abc')
        .set(bearer(admin.token));
      expect(response.status).toBe(400);
    });

    it('atribuição com body inválido', async () => {
      const response = await api(ctx.server)
        .post('/deliveries')
        .set(bearer(operator.token))
        .send({ orderId: 'x', driverId: 5 });
      expect(response.status).toBe(400);
      expect(Array.isArray(response.body.message)).toBe(true);
    });

    it.each([
      ['peso negativo', { weightKg: -5 }],
      ['peso zero', { weightKg: 0 }],
      ['descrição curta', { description: 'a' }],
      ['CEP com letras', { origin: { cep: 'abcdefgh', number: '1' } }],
      ['destino ausente', { destination: undefined }],
      ['campo desconhecido', { status: 'DELIVERED' }],
    ])('pedido com %s', async (_label, override) => {
      const response = await api(ctx.server)
        .post('/orders')
        .set(bearer(customer.token))
        .send(orderPayload(override));
      expect(response.status).toBe(400);
    });

    it('pedido com origem e destino idênticos', async () => {
      const response = await api(ctx.server)
        .post('/orders')
        .set(bearer(customer.token))
        .send(
          orderPayload({ destination: { cep: '01001000', number: '100' } }),
        );
      expect(response.status).toBe(400);
    });

    it('veículo com placa inválida ou capacidade negativa', async () => {
      const plate = await api(ctx.server)
        .post('/vehicles')
        .set(bearer(operator.token))
        .send({ plate: '123', model: 'Van', type: 'VAN', capacityKg: 100 });
      expect(plate.status).toBe(400);

      const capacity = await api(ctx.server)
        .post('/vehicles')
        .set(bearer(operator.token))
        .send({ plate: 'XYZ1A23', model: 'Van', type: 'VAN', capacityKg: -1 });
      expect(capacity.status).toBe(400);
    });

    it('mudança de status com valor fora do enum', async () => {
      const response = await api(ctx.server)
        .patch(`/deliveries/${RANDOM_UUID}/status`)
        .set(bearer(operator.token))
        .send({ status: 'EXPLODED' });
      expect(response.status).toBe(400);
    });

    it('paginação inválida', async () => {
      const response = await api(ctx.server)
        .get('/vehicles?limit=1000&page=0')
        .set(bearer(operator.token));
      expect(response.status).toBe(400);
    });

    it('JSON malformado', async () => {
      const response = await api(ctx.server)
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ "email": ');
      expect(response.status).toBe(400);
    });
  });

  describe('413 - corpo da requisição JSON grande demais', () => {
    it('não vira 500: usa o mesmo formato de erro padronizado', async () => {
      const response = await api(ctx.server)
        .post('/orders')
        .set(bearer(customer.token))
        .send(orderPayload({ description: 'a'.repeat(200_000) }));
      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({
        statusCode: 413,
        error: 'Payload Too Large',
        path: '/orders',
      });
    });
  });

  describe('409 - conflitos de atribuição', () => {
    it('motorista e veículo compatíveis: atribuição aceita (controle positivo)', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const vehicle = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);
      expect(
        (await assign(order.id, driver.driverId!, vehicle.id)).status,
      ).toBe(201);
    });

    it('motorista que já tem entrega ativa', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const [v1, v2] = [
        await createVehicle(ctx.prisma),
        await createVehicle(ctx.prisma),
      ];
      const [o1, o2] = [
        await createOrder(ctx, customer),
        await createOrder(ctx, customer),
      ];
      await assign(o1.id, driver.driverId!, v1.id).then((r) =>
        expect(r.status).toBe(201),
      );

      const response = await assign(o2.id, driver.driverId!, v2.id);
      expect(response.status).toBe(409);
      expect(response.body.message).toContain(
        'Motorista já possui uma entrega ativa',
      );
    });

    it('veículo que já está em entrega ativa', async () => {
      const [d1, d2] = [
        await createActor(ctx, Role.DRIVER),
        await createActor(ctx, Role.DRIVER),
      ];
      const vehicle = await createVehicle(ctx.prisma);
      const [o1, o2] = [
        await createOrder(ctx, customer),
        await createOrder(ctx, customer),
      ];
      await assign(o1.id, d1.driverId!, vehicle.id).then((r) =>
        expect(r.status).toBe(201),
      );

      const response = await assign(o2.id, d2.driverId!, vehicle.id);
      expect(response.status).toBe(409);
      expect(response.body.message).toContain(
        'Veículo já está em uma entrega ativa',
      );
    });

    it('pedido que já tem entrega ativa', async () => {
      const [d1, d2] = [
        await createActor(ctx, Role.DRIVER),
        await createActor(ctx, Role.DRIVER),
      ];
      const [v1, v2] = [
        await createVehicle(ctx.prisma),
        await createVehicle(ctx.prisma),
      ];
      const order = await createOrder(ctx, customer);
      await assign(order.id, d1.driverId!, v1.id).then((r) =>
        expect(r.status).toBe(201),
      );

      const response = await assign(order.id, d2.driverId!, v2.id);
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('não pode receber atribuição');
    });

    it('peso do pedido acima da capacidade do veículo', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const vehicle = await createVehicle(ctx.prisma, { capacityKg: 5 });
      const order = await createOrder(ctx, customer, { weightKg: 50 });

      const response = await assign(order.id, driver.driverId!, vehicle.id);
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('excede a capacidade');
    });

    it('CNH categoria A não habilita van; B não habilita caminhão', async () => {
      const motoDriver = await createActor(ctx, Role.DRIVER, {
        licenseCategory: LicenseCategory.A,
      });
      const carDriver = await createActor(ctx, Role.DRIVER, {
        licenseCategory: LicenseCategory.B,
      });
      const van = await createVehicle(ctx.prisma, { type: VehicleType.VAN });
      const truck = await createVehicle(ctx.prisma, {
        type: VehicleType.TRUCK,
        capacityKg: 5000,
      });
      const [o1, o2] = [
        await createOrder(ctx, customer),
        await createOrder(ctx, customer),
      ];

      const a = await assign(o1.id, motoDriver.driverId!, van.id);
      expect(a.status).toBe(409);
      expect(a.body.message).toContain('não habilita');

      const b = await assign(o2.id, carDriver.driverId!, truck.id);
      expect(b.status).toBe(409);
      expect(b.body.message).toContain('TRUCK');
    });

    it('CNH vencida', async () => {
      const driver = await createActor(ctx, Role.DRIVER, {
        licenseExpiresAt: new Date('2020-01-01'),
      });
      const vehicle = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);

      const response = await assign(order.id, driver.driverId!, vehicle.id);
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('CNH do motorista está vencida');
    });

    it('motorista inativo e veículo em manutenção, com todos os motivos reportados', async () => {
      const driver = await createActor(ctx, Role.DRIVER, {
        driverActive: false,
      });
      const vehicle = await createVehicle(ctx.prisma, {
        status: 'MAINTENANCE',
      });
      const order = await createOrder(ctx, customer);

      const response = await assign(order.id, driver.driverId!, vehicle.id);
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('Motorista está inativo');
      expect(response.body.message).toContain('Veículo indisponível');
    });

    it('pedido cancelado não recebe atribuição', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const vehicle = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);
      await api(ctx.server)
        .post(`/orders/${order.id}/cancel`)
        .set(bearer(customer.token))
        .expect(201);

      const response = await assign(order.id, driver.driverId!, vehicle.id);
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('CANCELLED');
    });

    it('condição de corrida: duas atribuições simultâneas ao mesmo motorista → uma vence, a outra recebe 409', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const [v1, v2] = [
        await createVehicle(ctx.prisma),
        await createVehicle(ctx.prisma),
      ];
      const [o1, o2] = [
        await createOrder(ctx, customer),
        await createOrder(ctx, customer),
      ];

      const results = await Promise.all([
        assign(o1.id, driver.driverId!, v1.id),
        assign(o2.id, driver.driverId!, v2.id),
      ]);
      const statuses = results.map((r) => r.status).sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.message).toMatch(/entrega ativa/);

      const active = await ctx.prisma.delivery.count({
        where: {
          driverId: driver.driverId!,
          status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] },
        },
      });
      expect(active).toBe(1);
    });
  });

  describe('409 - fluxo de estados', () => {
    let driver: Actor;
    let delivery: { id: string };

    beforeEach(async () => {
      driver = await createActor(ctx, Role.DRIVER);
      const vehicle = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);
      delivery = await assign(order.id, driver.driverId!, vehicle.id).then(
        (r) => r.body,
      );
    });

    const patch = (status: string, token = driver.token) =>
      api(ctx.server)
        .patch(`/deliveries/${delivery.id}/status`)
        .set(bearer(token))
        .send({ status });

    it.each([
      ['ASSIGNED', 'DELIVERED (pula etapas)', 'DELIVERED'],
      ['ASSIGNED', 'IN_TRANSIT (pula etapas)', 'IN_TRANSIT'],
      ['ASSIGNED', 'ASSIGNED (mesmo estado)', 'ASSIGNED'],
    ])('a partir de %s → %s é rejeitado', async (_from, _label, target) => {
      const response = await patch(target);
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('Transição inválida');
    });

    it('DELIVERED sem comprovante é rejeitado', async () => {
      await patch('PICKED_UP').then((r) => expect(r.status).toBe(200));
      await patch('IN_TRANSIT').then((r) => expect(r.status).toBe(200));
      const response = await patch('DELIVERED');
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('comprovante');
    });

    it('estados finais não permitem novas transições nem ocorrências', async () => {
      await api(ctx.server)
        .post(`/deliveries/${delivery.id}/occurrences`)
        .set(bearer(driver.token))
        .send({
          type: 'VEHICLE_BREAKDOWN',
          description: 'Pneu furado na rodovia',
        })
        .expect(201);
      await patch('FAILED').then((r) => expect(r.status).toBe(200));

      expect((await patch('PICKED_UP')).status).toBe(409);
      expect((await patch('FAILED')).status).toBe(409);

      const occurrence = await api(ctx.server)
        .post(`/deliveries/${delivery.id}/occurrences`)
        .set(bearer(driver.token))
        .send({ type: 'OTHER', description: 'depois de finalizada' });
      expect(occurrence.status).toBe(409);
    });

    it('operador cancela em qualquer estado ativo; depois disso é final', async () => {
      await patch('PICKED_UP').then((r) => expect(r.status).toBe(200));
      await patch('CANCELLED', operator.token).then((r) =>
        expect(r.status).toBe(200),
      );
      const again = await patch('CANCELLED', operator.token);
      expect(again.status).toBe(409);
    });

    it('upload de comprovante só é aceito em trânsito', async () => {
      const early = await api(ctx.server)
        .post(`/deliveries/${delivery.id}/proof`)
        .set(bearer(driver.token))
        .attach('file', PNG_BYTES, {
          filename: 'a.png',
          contentType: 'image/png',
        });
      expect(early.status).toBe(409);
    });

    it('cliente não cancela pedido com entrega atribuída', async () => {
      const list = await api(ctx.server)
        .get('/orders?status=SCHEDULED')
        .set(bearer(customer.token))
        .expect(200);
      const scheduled = list.body.data[0];
      const response = await api(ctx.server)
        .post(`/orders/${scheduled.id}/cancel`)
        .set(bearer(customer.token));
      expect(response.status).toBe(409);
    });
  });

  describe('409 - integridade dos cadastros', () => {
    it('placa duplicada', async () => {
      const payload = {
        plate: 'DUP1A11',
        model: 'Van',
        type: 'VAN',
        capacityKg: 100,
      };
      await api(ctx.server)
        .post('/vehicles')
        .set(bearer(operator.token))
        .send(payload)
        .expect(201);
      const response = await api(ctx.server)
        .post('/vehicles')
        .set(bearer(operator.token))
        .send(payload);
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('plate');
    });

    it('motorista com e-mail ou CNH já cadastrados', async () => {
      const payload = {
        name: 'Motorista Repetido',
        email: 'repetido@frota.com',
        password: 'Senha@1234',
        licenseNumber: '99988877766',
        licenseCategory: 'B',
        licenseExpiresAt: '2032-05-20',
        phone: '11999998888',
      };
      await api(ctx.server)
        .post('/drivers')
        .set(bearer(operator.token))
        .send(payload)
        .expect(201);

      const sameEmail = await api(ctx.server)
        .post('/drivers')
        .set(bearer(operator.token))
        .send({ ...payload, licenseNumber: '11122233344' });
      expect(sameEmail.status).toBe(409);

      const sameLicense = await api(ctx.server)
        .post('/drivers')
        .set(bearer(operator.token))
        .send({ ...payload, email: 'outro@frota.com' });
      expect(sameLicense.status).toBe(409);
    });

    it('e-mail duplicado ao criar usuário administrativo', async () => {
      const response = await api(ctx.server)
        .post('/users')
        .set(bearer(admin.token))
        .send({
          name: 'Outro Admin',
          email: operator.email,
          password: 'Senha@1234',
          role: 'ADMIN',
        });
      expect(response.status).toBe(409);
    });

    it('veículo com histórico não pode ser excluído; sem histórico pode', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const used = await createVehicle(ctx.prisma);
      const unused = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);
      await assign(order.id, driver.driverId!, used.id).then((r) =>
        expect(r.status).toBe(201),
      );

      const blocked = await api(ctx.server)
        .delete(`/vehicles/${used.id}`)
        .set(bearer(operator.token));
      expect(blocked.status).toBe(409);

      await api(ctx.server)
        .delete(`/vehicles/${unused.id}`)
        .set(bearer(operator.token))
        .expect(204);
      await api(ctx.server)
        .get(`/vehicles/${unused.id}`)
        .set(bearer(operator.token))
        .expect(404);
    });

    it('veículo e motorista em entrega ativa não podem ser inativados', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const vehicle = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);
      await assign(order.id, driver.driverId!, vehicle.id).then((r) =>
        expect(r.status).toBe(201),
      );

      const v = await api(ctx.server)
        .patch(`/vehicles/${vehicle.id}`)
        .set(bearer(operator.token))
        .send({ status: 'MAINTENANCE' });
      expect(v.status).toBe(409);

      const d = await api(ctx.server)
        .patch(`/drivers/${driver.driverId}`)
        .set(bearer(operator.token))
        .send({ active: false });
      expect(d.status).toBe(409);
    });

    it('administrador não pode desativar a própria conta', async () => {
      const response = await api(ctx.server)
        .patch(`/users/${admin.userId}`)
        .set(bearer(admin.token))
        .send({ active: false });
      expect(response.status).toBe(409);
    });

    it('desativar um usuário derruba o acesso imediatamente', async () => {
      const victim = await createActor(ctx, Role.CUSTOMER);
      await api(ctx.server)
        .patch(`/users/${victim.userId}`)
        .set(bearer(admin.token))
        .send({ active: false })
        .expect(200);
      await api(ctx.server)
        .get('/auth/me')
        .set(bearer(victim.token))
        .expect(401);
    });

    it('capacidade do veículo não pode cair abaixo do peso já em entrega ativa', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const vehicle = await createVehicle(ctx.prisma, { capacityKg: 500 });
      const order = await createOrder(ctx, customer, { weightKg: 300 });
      await assign(order.id, driver.driverId!, vehicle.id).then((r) =>
        expect(r.status).toBe(201),
      );

      const response = await api(ctx.server)
        .patch(`/vehicles/${vehicle.id}`)
        .set(bearer(operator.token))
        .send({ capacityKg: 100 });
      expect(response.status).toBe(409);

      const stillOriginal = await ctx.prisma.vehicle.findUniqueOrThrow({
        where: { id: vehicle.id },
      });
      expect(stillOriginal.capacityKg).toBe(500);
    });

    it('tipo do veículo não pode virar incompatível com a CNH do motorista em entrega ativa', async () => {
      const driver = await createActor(ctx, Role.DRIVER, {
        licenseCategory: LicenseCategory.B,
      });
      const vehicle = await createVehicle(ctx.prisma, {
        type: VehicleType.VAN,
      });
      const order = await createOrder(ctx, customer);
      await assign(order.id, driver.driverId!, vehicle.id).then((r) =>
        expect(r.status).toBe(201),
      );

      const response = await api(ctx.server)
        .patch(`/vehicles/${vehicle.id}`)
        .set(bearer(operator.token))
        .send({ type: 'TRUCK' });
      expect(response.status).toBe(409);
    });

    it('categoria da CNH do motorista não pode virar incompatível com o veículo em entrega ativa', async () => {
      const driver = await createActor(ctx, Role.DRIVER, {
        licenseCategory: LicenseCategory.C,
      });
      const vehicle = await createVehicle(ctx.prisma, {
        type: VehicleType.TRUCK,
        capacityKg: 4000,
      });
      const order = await createOrder(ctx, customer, { weightKg: 10 });
      await assign(order.id, driver.driverId!, vehicle.id).then((r) =>
        expect(r.status).toBe(201),
      );

      const response = await api(ctx.server)
        .patch(`/drivers/${driver.driverId}`)
        .set(bearer(operator.token))
        .send({ licenseCategory: 'A' });
      expect(response.status).toBe(409);

      const stillOriginal = await ctx.prisma.driver.findUniqueOrThrow({
        where: { id: driver.driverId },
      });
      expect(stillOriginal.licenseCategory).toBe('C');
    });

    it('veículo/motorista sem entrega ativa aceita normalmente a mesma mudança (controle positivo)', async () => {
      const freeVehicle = await createVehicle(ctx.prisma, {
        capacityKg: 500,
        type: VehicleType.VAN,
      });
      const freeDriver = await createActor(ctx, Role.DRIVER, {
        licenseCategory: LicenseCategory.C,
      });

      await api(ctx.server)
        .patch(`/vehicles/${freeVehicle.id}`)
        .set(bearer(operator.token))
        .send({ capacityKg: 100, type: 'TRUCK' })
        .expect(200);

      await api(ctx.server)
        .patch(`/drivers/${freeDriver.driverId}`)
        .set(bearer(operator.token))
        .send({ licenseCategory: 'A' })
        .expect(200);
    });
  });

  describe('consultas por relacionamento, filtros e paginação', () => {
    it('lista apenas motoristas e veículos disponíveis para atribuição', async () => {
      await resetDatabase(ctx.prisma);
      admin = await createActor(ctx, Role.ADMIN);
      operator = await createActor(ctx, Role.OPERATOR);
      customer = await createActor(ctx, Role.CUSTOMER);

      const free = await createActor(ctx, Role.DRIVER);
      const busy = await createActor(ctx, Role.DRIVER);
      await createActor(ctx, Role.DRIVER, { driverActive: false });
      await createActor(ctx, Role.DRIVER, {
        licenseExpiresAt: new Date('2020-01-01'),
      });
      const freeVehicle = await createVehicle(ctx.prisma);
      const busyVehicle = await createVehicle(ctx.prisma);
      await createVehicle(ctx.prisma, { status: 'MAINTENANCE' });
      const order = await createOrder(ctx, customer);
      await assign(order.id, busy.driverId!, busyVehicle.id).then((r) =>
        expect(r.status).toBe(201),
      );

      const drivers = await api(ctx.server)
        .get('/drivers?available=true')
        .set(bearer(operator.token))
        .expect(200);
      expect(drivers.body.data.map((d: { id: string }) => d.id)).toEqual([
        free.driverId,
      ]);

      const vehicles = await api(ctx.server)
        .get('/vehicles?available=true')
        .set(bearer(operator.token))
        .expect(200);
      expect(vehicles.body.data.map((v: { id: string }) => v.id)).toEqual([
        freeVehicle.id,
      ]);
    });

    it('entregas por motorista, por veículo e pedidos por cliente', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const vehicle = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);
      await assign(order.id, driver.driverId!, vehicle.id).then((r) =>
        expect(r.status).toBe(201),
      );

      const byDriver = await api(ctx.server)
        .get(`/drivers/${driver.driverId}/deliveries`)
        .set(bearer(operator.token))
        .expect(200);
      const byVehicle = await api(ctx.server)
        .get(`/vehicles/${vehicle.id}/deliveries`)
        .set(bearer(operator.token))
        .expect(200);
      const byCustomer = await api(ctx.server)
        .get(`/customers/${customer.customerId}/orders?status=SCHEDULED`)
        .set(bearer(operator.token))
        .expect(200);

      expect(byDriver.body.meta.total).toBe(1);
      expect(byVehicle.body.meta.total).toBe(1);
      expect(
        byCustomer.body.data.every(
          (o: { customerId: string }) => o.customerId === customer.customerId,
        ),
      ).toBe(true);
      expect(byCustomer.body.data.length).toBeGreaterThan(0);
    });

    it('paginação e ordenação', async () => {
      await resetDatabase(ctx.prisma);
      operator = await createActor(ctx, Role.OPERATOR);
      for (let i = 0; i < 5; i++) await createVehicle(ctx.prisma);

      const page1 = await api(ctx.server)
        .get('/vehicles?limit=2&page=1&order=asc')
        .set(bearer(operator.token))
        .expect(200);
      const page3 = await api(ctx.server)
        .get('/vehicles?limit=2&page=3&order=asc')
        .set(bearer(operator.token))
        .expect(200);

      expect(page1.body.meta).toEqual({
        total: 5,
        page: 1,
        limit: 2,
        totalPages: 3,
      });
      expect(page1.body.data).toHaveLength(2);
      expect(page3.body.data).toHaveLength(1);
    });
  });
});
