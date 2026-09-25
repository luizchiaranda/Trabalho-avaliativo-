import { Role } from '../src/generated/prisma/client.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/app.js';
import {
  api,
  assignDelivery,
  bearer,
  createActor,
  createOrder,
  createVehicle,
  type Actor,
} from './helpers/factories.js';

const RANDOM_UUID = '00000000-0000-4000-8000-000000000001';

describe('Exclusões (DELETE)', () => {
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

  const del = (path: string, actor: Actor) =>
    api(ctx.server).delete(path).set(bearer(actor.token));

  describe('DELETE /users/:id', () => {
    it('exclui usuário sem histórico, junto com o perfil; o token dele deixa de valer', async () => {
      const customer = await createActor(ctx, Role.CUSTOMER);

      await del(`/users/${customer.userId}`, admin).expect(204);

      expect(
        await ctx.prisma.user.findUnique({ where: { id: customer.userId } }),
      ).toBeNull();
      expect(
        await ctx.prisma.customer.findUnique({
          where: { id: customer.customerId },
        }),
      ).toBeNull();
      await api(ctx.server)
        .get('/auth/me')
        .set(bearer(customer.token))
        .expect(401);
    });

    it('exclui também motorista sem entregas (perfil Driver junto)', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      await del(`/users/${driver.userId}`, admin).expect(204);
      expect(
        await ctx.prisma.driver.findUnique({ where: { id: driver.driverId } }),
      ).toBeNull();
    });

    it('409 para a própria conta', async () => {
      const response = await del(`/users/${admin.userId}`, admin);
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/própria conta/);
    });

    it('409 para conta com histórico (cliente com pedido, operador que atribuiu entrega)', async () => {
      const customer = await createActor(ctx, Role.CUSTOMER);
      const assigner = await createActor(ctx, Role.OPERATOR);
      const driver = await createActor(ctx, Role.DRIVER);
      const vehicle = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);
      await assignDelivery(ctx, assigner, {
        orderId: order.id,
        driverId: driver.driverId!,
        vehicleId: vehicle.id,
      }).then((r) => expect(r.status).toBe(201));

      for (const actor of [customer, assigner, driver]) {
        const response = await del(`/users/${actor.userId}`, admin);
        expect(response.status).toBe(409);
        expect(response.body.message).toMatch(/active: false/);
      }
      expect(
        await ctx.prisma.user.count({ where: { id: customer.userId } }),
      ).toBe(1);
    });

    it('404 para usuário inexistente e 400 para id inválido', async () => {
      await del(`/users/${RANDOM_UUID}`, admin).expect(404);
      await del('/users/nao-e-uuid', admin).expect(400);
    });

    it('403 para quem não é ADMIN', async () => {
      const target = await createActor(ctx, Role.CUSTOMER);
      await del(`/users/${target.userId}`, operator).expect(403);
    });
  });

  describe('DELETE /drivers/:id', () => {
    it('exclui motorista sem entregas e o usuário dele', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      await del(`/drivers/${driver.driverId}`, operator).expect(204);
      expect(
        await ctx.prisma.user.findUnique({ where: { id: driver.userId } }),
      ).toBeNull();
    });

    it('409 para motorista com entrega', async () => {
      const customer = await createActor(ctx, Role.CUSTOMER);
      const driver = await createActor(ctx, Role.DRIVER);
      const vehicle = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);
      await assignDelivery(ctx, operator, {
        orderId: order.id,
        driverId: driver.driverId!,
        vehicleId: vehicle.id,
      }).then((r) => expect(r.status).toBe(201));

      const response = await del(`/drivers/${driver.driverId}`, operator);
      expect(response.status).toBe(409);
    });

    it('404 para inexistente; 403 para motorista e cliente', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const customer = await createActor(ctx, Role.CUSTOMER);
      await del(`/drivers/${RANDOM_UUID}`, operator).expect(404);
      await del(`/drivers/${driver.driverId}`, driver).expect(403);
      await del(`/drivers/${driver.driverId}`, customer).expect(403);
    });
  });

  describe('DELETE /customers/:id', () => {
    it('exclui cliente sem pedidos e o usuário dele', async () => {
      const customer = await createActor(ctx, Role.CUSTOMER);
      await del(`/customers/${customer.customerId}`, admin).expect(204);
      expect(
        await ctx.prisma.user.findUnique({ where: { id: customer.userId } }),
      ).toBeNull();
    });

    it('409 para cliente com pedido', async () => {
      const customer = await createActor(ctx, Role.CUSTOMER);
      await createOrder(ctx, customer);
      const response = await del(`/customers/${customer.customerId}`, operator);
      expect(response.status).toBe(409);
    });

    it('404 para inexistente; 403 para o próprio cliente', async () => {
      const customer = await createActor(ctx, Role.CUSTOMER);
      await del(`/customers/${RANDOM_UUID}`, operator).expect(404);
      await del(`/customers/${customer.customerId}`, customer).expect(403);
    });
  });
});
