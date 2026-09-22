import { Role } from '../src/generated/prisma/client.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/app.js';
import { CEP } from './helpers/cep-mock.js';
import {
  api,
  bearer,
  createActor,
  orderPayload,
  type Actor,
} from './helpers/factories.js';

describe('Integração externa: consulta de CEP (HttpService)', () => {
  let ctx: TestApp;
  let customer: Actor;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    customer = await createActor(ctx, Role.CUSTOMER);
  });

  afterAll(() => ctx.close());

  const lookup = (cep: string) =>
    api(ctx.server).get(`/cep/${cep}`).set(bearer(customer.token));

  describe('funcionando', () => {
    it('consulta o provedor e devolve o endereço normalizado', async () => {
      const response = await lookup('01001-000');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        cep: CEP.SAO_PAULO,
        street: 'Praça da Sé',
        neighborhood: 'Sé',
        city: 'São Paulo',
        state: 'SP',
      });
      expect(ctx.cepMock.requests).toContain(CEP.SAO_PAULO);
    });

    it('o pedido usa a integração: endereços de origem e destino vêm do provedor', async () => {
      const before = ctx.cepMock.requests.length;
      const response = await api(ctx.server)
        .post('/orders')
        .set(bearer(customer.token))
        .send(orderPayload());
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        originCity: 'São Paulo',
        originState: 'SP',
        destinationCity: 'Rio de Janeiro',
        destinationState: 'RJ',
      });
      expect(ctx.cepMock.requests.slice(before).sort()).toEqual(
        [CEP.SAO_PAULO, CEP.RIO].sort(),
      );
    });
  });

  describe('falhando de forma controlada', () => {
    it('400 para CEP com formato inválido (o provedor nem é consultado)', async () => {
      const before = ctx.cepMock.requests.length;
      const response = await lookup('123');
      expect(response.status).toBe(400);
      expect(ctx.cepMock.requests).toHaveLength(before);
    });

    it('404 para CEP que o provedor não conhece', async () => {
      const response = await lookup(CEP.NOT_FOUND);
      expect(response.status).toBe(404);
      expect(response.body.message).toContain('não encontrado');
    });

    it('504 quando o provedor excede o timeout configurado', async () => {
      const startedAt = Date.now();
      const response = await lookup(CEP.SLOW);
      const elapsed = Date.now() - startedAt;
      expect(response.status).toBe(504);
      expect(response.body.message).toContain('Tempo esgotado');
      expect(elapsed).toBeLessThan(1400);
    });

    it('502 quando o provedor responde com erro 500', async () => {
      const response = await lookup(CEP.UPSTREAM_ERROR);
      expect(response.status).toBe(502);
      expect(response.body.message).toBe(
        'Serviço de CEP indisponível no momento',
      );
    });

    it('502 quando o provedor responde algo inesperado', async () => {
      const response = await lookup(CEP.MALFORMED);
      expect(response.status).toBe(502);
    });

    it('a resposta de erro não vaza detalhes internos do provedor', async () => {
      const response = await lookup(CEP.UPSTREAM_ERROR);
      const body = JSON.stringify(response.body);
      expect(body).not.toMatch(/127\.0\.0\.1|4010|boom|axios|stack/i);
    });

    it('a falha do provedor impede a criação do pedido (nada é gravado pela metade)', async () => {
      const before = await ctx.prisma.deliveryOrder.count();
      const response = await api(ctx.server)
        .post('/orders')
        .set(bearer(customer.token))
        .send(
          orderPayload({ destination: { cep: CEP.NOT_FOUND, number: '1' } }),
        );
      expect(response.status).toBe(404);
      expect(await ctx.prisma.deliveryOrder.count()).toBe(before);

      const slow = await api(ctx.server)
        .post('/orders')
        .set(bearer(customer.token))
        .send(orderPayload({ origin: { cep: CEP.SLOW, number: '1' } }));
      expect(slow.status).toBe(504);
      expect(await ctx.prisma.deliveryOrder.count()).toBe(before);
    });

    it('502 quando o provedor está fora do ar (conexão recusada)', async () => {
      await ctx.cepMock.close();
      const response = await lookup(CEP.SAO_PAULO);
      expect(response.status).toBe(502);
    });
  });
});
