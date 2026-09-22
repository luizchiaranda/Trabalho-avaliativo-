import { Role } from '../src/generated/prisma/client.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/app.js';
import {
  api,
  PNG_BYTES,
  TEST_PASSWORD,
  assignDelivery,
  bearer,
  createActor,
  createOrder,
  createVehicle,
  login,
  type Actor,
} from './helpers/factories.js';

describe('Fluxo principal e mudança de estado', () => {
  let ctx: TestApp;
  let admin: Actor;
  let operator: Actor;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    admin = await createActor(ctx, Role.ADMIN);
    operator = await createActor(ctx, Role.OPERATOR);
  });

  afterAll(() => ctx.close());

  it('executa o fluxo completo: cadastro → pedido → atribuição → entrega → histórico', async () => {
    const registered = await api(ctx.server)
      .post('/auth/register')
      .send({
        name: 'Maria Cliente',
        email: 'maria@cliente.com',
        password: TEST_PASSWORD,
        document: '529.982.247-25',
        phone: '(11) 98888-7777',
      })
      .expect(201);
    expect(registered.body.role).toBe('CUSTOMER');
    expect(registered.body.customer.document).toBe('52998224725');
    const customerToken = await login(ctx, 'maria@cliente.com');

    const createdOperator = await api(ctx.server)
      .post('/users')
      .set(bearer(admin.token))
      .send({
        name: 'Nova Operadora',
        email: 'nova.operadora@empresa.com',
        password: TEST_PASSWORD,
        role: 'OPERATOR',
      })
      .expect(201);
    expect(createdOperator.body.role).toBe('OPERATOR');
    const operatorToken = await login(ctx, 'nova.operadora@empresa.com');

    const driverResponse = await api(ctx.server)
      .post('/drivers')
      .set(bearer(operatorToken))
      .send({
        name: 'João Motorista',
        email: 'joao@frota.com',
        password: TEST_PASSWORD,
        licenseNumber: '12345678900',
        licenseCategory: 'B',
        licenseExpiresAt: '2035-01-31',
        phone: '11999998888',
      })
      .expect(201);
    const driverId = driverResponse.body.id as string;
    const driverToken = await login(ctx, 'joao@frota.com');

    const vehicleResponse = await api(ctx.server)
      .post('/vehicles')
      .set(bearer(operatorToken))
      .send({
        plate: 'abc-1d23',
        model: 'Fiat Fiorino',
        type: 'VAN',
        capacityKg: 650,
      })
      .expect(201);
    expect(vehicleResponse.body.plate).toBe('ABC1D23');
    const vehicleId = vehicleResponse.body.id as string;

    const orderResponse = await api(ctx.server)
      .post('/orders')
      .set(bearer(customerToken))
      .send({
        description: 'Notebook para reparo',
        weightKg: 3.5,
        origin: { cep: '01001-000', number: '10' },
        destination: { cep: '20040020', number: '20', complement: 'Sala 5' },
      })
      .expect(201);
    const order = orderResponse.body;
    expect(order.status).toBe('PENDING');
    expect(order.originCity).toBe('São Paulo');
    expect(order.destinationState).toBe('RJ');
    expect(order.originStreet).toBe('Praça da Sé');

    const assigned = await assignDelivery(
      ctx,
      { token: operatorToken } as Actor,
      {
        orderId: order.id,
        driverId,
        vehicleId,
      },
    );
    expect(assigned.status).toBe(201);
    expect(assigned.body.status).toBe('ASSIGNED');
    const deliveryId = assigned.body.id as string;

    const afterAssign = await api(ctx.server)
      .get(`/orders/${order.id}`)
      .set(bearer(customerToken))
      .expect(200);
    expect(afterAssign.body.status).toBe('SCHEDULED');

    const driverList = await api(ctx.server)
      .get('/deliveries')
      .set(bearer(driverToken))
      .expect(200);
    expect(driverList.body.meta.total).toBe(1);
    expect(driverList.body.data[0].id).toBe(deliveryId);

    const patch = (status: string) =>
      api(ctx.server)
        .patch(`/deliveries/${deliveryId}/status`)
        .set(bearer(driverToken))
        .send({ status });

    expect((await patch('PICKED_UP')).status).toBe(200);
    const inTransit = await patch('IN_TRANSIT');
    expect(inTransit.status).toBe(200);
    expect(inTransit.body.status).toBe('IN_TRANSIT');

    const orderInTransit = await api(ctx.server)
      .get(`/orders/${order.id}`)
      .set(bearer(customerToken))
      .expect(200);
    expect(orderInTransit.body.status).toBe('IN_TRANSIT');

    const uploaded = await api(ctx.server)
      .post(`/deliveries/${deliveryId}/proof`)
      .set(bearer(driverToken))
      .attach('file', PNG_BYTES, {
        filename: 'comprovante.png',
        contentType: 'image/png',
      })
      .expect(201);
    expect(uploaded.body.proof.mimeType).toBe('image/png');
    expect(uploaded.body.proof.originalName).toBe('comprovante.png');
    expect(uploaded.body).not.toHaveProperty('proofPath');

    const delivered = await patch('DELIVERED');
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe('DELIVERED');
    expect(delivered.body.finishedAt).toBeTruthy();

    const finalOrder = await api(ctx.server)
      .get(`/orders/${order.id}`)
      .set(bearer(customerToken))
      .expect(200);
    expect(finalOrder.body.status).toBe('DELIVERED');

    const history = await api(ctx.server)
      .get(`/deliveries/${deliveryId}/history`)
      .set(bearer(customerToken))
      .expect(200);
    expect(
      history.body.map((h: { fromStatus: string | null; toStatus: string }) => [
        h.fromStatus,
        h.toStatus,
      ]),
    ).toEqual([
      [null, 'ASSIGNED'],
      ['ASSIGNED', 'PICKED_UP'],
      ['PICKED_UP', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'DELIVERED'],
    ]);

    const download = await api(ctx.server)
      .get(`/deliveries/${deliveryId}/proof`)
      .set(bearer(customerToken))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(download.headers['content-type']).toContain('image/png');
    expect(Buffer.compare(download.body as Buffer, PNG_BYTES)).toBe(0);

    const again = await patch('IN_TRANSIT');
    expect(again.status).toBe(409);
  });

  it('falha → reabre o pedido → permite nova atribuição a outro motorista', async () => {
    const customer = await createActor(ctx, Role.CUSTOMER);
    const driverA = await createActor(ctx, Role.DRIVER);
    const driverB = await createActor(ctx, Role.DRIVER);
    const vehicle = await createVehicle(ctx.prisma);
    const order = await createOrder(ctx, customer);

    const first = await assignDelivery(ctx, operator, {
      orderId: order.id,
      driverId: driverA.driverId!,
      vehicleId: vehicle.id,
    }).then((r) => r.body);

    const failWithoutOccurrence = await api(ctx.server)
      .patch(`/deliveries/${first.id}/status`)
      .set(bearer(driverA.token))
      .send({ status: 'FAILED' });
    expect(failWithoutOccurrence.status).toBe(409);

    await api(ctx.server)
      .post(`/deliveries/${first.id}/occurrences`)
      .set(bearer(driverA.token))
      .send({
        type: 'RECIPIENT_ABSENT',
        description: 'Destinatário ausente no endereço',
      })
      .expect(201);

    await api(ctx.server)
      .patch(`/deliveries/${first.id}/status`)
      .set(bearer(driverA.token))
      .send({ status: 'FAILED', note: 'Ninguém atendeu' })
      .expect(200);

    const reopened = await api(ctx.server)
      .get(`/orders/${order.id}`)
      .set(bearer(customer.token))
      .expect(200);
    expect(reopened.body.status).toBe('PENDING');

    const second = await assignDelivery(ctx, operator, {
      orderId: order.id,
      driverId: driverB.driverId!,
      vehicleId: vehicle.id,
    });
    expect(second.status).toBe(201);

    const attempts = await api(ctx.server)
      .get(`/orders/${order.id}/deliveries`)
      .set(bearer(customer.token))
      .expect(200);
    expect(attempts.body.meta.total).toBe(2);

    const occurrences = await api(ctx.server)
      .get(`/deliveries/${first.id}/occurrences`)
      .set(bearer(customer.token))
      .expect(200);
    expect(occurrences.body).toHaveLength(1);
    expect(occurrences.body[0].type).toBe('RECIPIENT_ABSENT');
  });

  it('operador cancela a entrega → pedido volta a PENDING; cliente cancela pedido PENDING', async () => {
    const customer = await createActor(ctx, Role.CUSTOMER);
    const driver = await createActor(ctx, Role.DRIVER);
    const vehicle = await createVehicle(ctx.prisma);
    const order = await createOrder(ctx, customer);

    const delivery = await assignDelivery(ctx, operator, {
      orderId: order.id,
      driverId: driver.driverId!,
      vehicleId: vehicle.id,
    }).then((r) => r.body);

    const blocked = await api(ctx.server)
      .post(`/orders/${order.id}/cancel`)
      .set(bearer(customer.token));
    expect(blocked.status).toBe(409);

    await api(ctx.server)
      .patch(`/deliveries/${delivery.id}/status`)
      .set(bearer(operator.token))
      .send({ status: 'CANCELLED', note: 'Cliente pediu reagendamento' })
      .expect(200);

    const cancelled = await api(ctx.server)
      .post(`/orders/${order.id}/cancel`)
      .set(bearer(customer.token))
      .expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
  });
});
