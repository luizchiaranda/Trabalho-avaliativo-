import request from 'supertest';
import { Role } from '../src/generated/prisma/client.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/app.js';
import { TEST_API_KEY } from './helpers/constants.js';
import { api, bearer, createActor, type Actor } from './helpers/factories.js';

describe('X-API-KEY em todas as rotas', () => {
  let ctx: TestApp;
  let customer: Actor;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    customer = await createActor(ctx, Role.CUSTOMER);
  });

  afterAll(() => ctx.close());

  it('401 sem o cabeçalho, mesmo numa rota pública (/health)', async () => {
    const response = await request(ctx.server).get('/health');
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Chave de API ausente ou inválida');
  });

  it('401 com a chave errada', async () => {
    const response = await request(ctx.server)
      .get('/health')
      .set('X-Api-Key', 'chave-errada-qualquer');
    expect(response.status).toBe(401);
  });

  it('401 em rota pública de autenticação sem a chave', async () => {
    const response = await request(ctx.server)
      .post('/auth/login')
      .send({ email: customer.email, password: 'Senha@1234' });
    expect(response.status).toBe(401);
  });

  it('200 com a chave correta em rota pública', async () => {
    const response = await request(ctx.server)
      .get('/health')
      .set('X-Api-Key', TEST_API_KEY);
    expect(response.status).toBe(200);
  });

  it('chave correta não dispensa o JWT em rota privada', async () => {
    const response = await request(ctx.server)
      .get('/orders')
      .set('X-Api-Key', TEST_API_KEY);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Token ausente ou inválido');
  });

  it('JWT válido não dispensa a chave de API', async () => {
    const response = await request(ctx.server)
      .get('/orders')
      .set(bearer(customer.token));
    expect(response.status).toBe(401);
  });

  it('com as duas credenciais corretas, a rota privada funciona (controle positivo)', async () => {
    await api(ctx.server)
      .get('/orders')
      .set(bearer(customer.token))
      .expect(200);
  });

  it('a chave de API é lida sem diferenciar maiúsculas do nome do cabeçalho HTTP', async () => {
    const response = await request(ctx.server)
      .get('/health')
      .set('x-api-key', TEST_API_KEY);
    expect(response.status).toBe(200);
  });
});
