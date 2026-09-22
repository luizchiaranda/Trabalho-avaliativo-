import { JwtService } from '@nestjs/jwt';
import { Role } from '../src/generated/prisma/client.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/app.js';
import {
  api,
  TEST_PASSWORD,
  bearer,
  createActor,
  type Actor,
} from './helpers/factories.js';

const validRegister = {
  name: 'Ana Cliente',
  email: 'ana@cliente.com',
  password: TEST_PASSWORD,
  document: '52998224725',
  phone: '11988887777',
};

describe('Autenticação', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });

  afterAll(() => ctx.close());

  describe('POST /auth/register', () => {
    it('cria cliente sem devolver dados sensíveis', async () => {
      const response = await api(ctx.server)
        .post('/auth/register')
        .send(validRegister)
        .expect(201);

      expect(response.body).toMatchObject({
        email: 'ana@cliente.com',
        role: 'CUSTOMER',
      });
      expect(JSON.stringify(response.body)).not.toMatch(
        /passwordHash|\$2[aby]\$/,
      );
    });

    it.each([
      ['e-mail inválido', { email: 'nao-e-email' }],
      ['senha curta', { password: 'a1' }],
      ['senha sem número', { password: 'somenteletras' }],
      ['CPF/CNPJ com tamanho errado', { document: '123' }],
      ['telefone inválido', { phone: '12' }],
      ['nome ausente', { name: undefined }],
    ])('400 para %s', async (_label, override) => {
      const response = await api(ctx.server)
        .post('/auth/register')
        .send({ ...validRegister, email: 'outro@x.com', ...override });
      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
      expect(response.body.message).toBeDefined();
    });

    it('400 ao tentar definir o próprio papel (mass assignment)', async () => {
      const response = await api(ctx.server)
        .post('/auth/register')
        .send({
          ...validRegister,
          email: 'hacker@x.com',
          document: '11144477735',
          role: 'ADMIN',
        });
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body.message)).toContain('role');
    });

    it('409 para e-mail duplicado e para documento duplicado', async () => {
      const email = await api(ctx.server)
        .post('/auth/register')
        .send({ ...validRegister, document: '11144477735' });
      expect(email.status).toBe(409);

      const document = await api(ctx.server)
        .post('/auth/register')
        .send({ ...validRegister, email: 'diferente@cliente.com' });
      expect(document.status).toBe(409);
    });
  });

  describe('POST /auth/login', () => {
    it('devolve token JWT e dados públicos do usuário', async () => {
      const response = await api(ctx.server)
        .post('/auth/login')
        .send({ email: 'ana@cliente.com', password: TEST_PASSWORD })
        .expect(200);

      expect(response.body.accessToken.split('.')).toHaveLength(3);
      expect(response.body.tokenType).toBe('Bearer');
      expect(response.body.user).toEqual({
        id: expect.any(String),
        name: 'Ana Cliente',
        email: 'ana@cliente.com',
        role: 'CUSTOMER',
      });
    });

    it('401 com a mesma mensagem para senha errada e e-mail inexistente', async () => {
      const wrongPassword = await api(ctx.server)
        .post('/auth/login')
        .send({ email: 'ana@cliente.com', password: 'Errada@123' });
      const unknownEmail = await api(ctx.server)
        .post('/auth/login')
        .send({ email: 'ninguem@x.com', password: TEST_PASSWORD });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });

    it('401 para usuário desativado', async () => {
      const actor = await createActor(ctx, Role.CUSTOMER);
      await ctx.prisma.user.update({
        where: { id: actor.userId },
        data: { active: false },
      });
      const response = await api(ctx.server)
        .post('/auth/login')
        .send({ email: actor.email, password: TEST_PASSWORD });
      expect(response.status).toBe(401);
    });

    it('400 para body inválido', async () => {
      const response = await api(ctx.server)
        .post('/auth/login')
        .send({ email: 'x' });
      expect(response.status).toBe(400);
    });
  });

  describe('GET /auth/me', () => {
    it('usa a identidade do token, sem senha na resposta', async () => {
      const driver = await createActor(ctx, Role.DRIVER);
      const response = await api(ctx.server)
        .get('/auth/me')
        .set(bearer(driver.token))
        .expect(200);

      expect(response.body.id).toBe(driver.userId);
      expect(response.body.driver.id).toBe(driver.driverId);
      expect(JSON.stringify(response.body)).not.toMatch(
        /passwordHash|\$2[aby]\$/,
      );
    });
  });

  describe('401 - rotas privadas', () => {
    let actor: Actor;
    beforeAll(async () => {
      actor = await createActor(ctx, Role.CUSTOMER);
    });

    it('sem token', async () => {
      const response = await api(ctx.server).get('/auth/me');
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Token ausente ou inválido');
    });

    it('esquema de autorização errado', async () => {
      const response = await api(ctx.server)
        .get('/auth/me')
        .set('Authorization', `Basic ${actor.token}`);
      expect(response.status).toBe(401);
    });

    it('token malformado', async () => {
      const response = await api(ctx.server)
        .get('/auth/me')
        .set(bearer('isto.nao.e.jwt'));
      expect(response.status).toBe(401);
    });

    it('token assinado com outro segredo', async () => {
      const forged = await new JwtService({ secret: 'x'.repeat(40) }).signAsync(
        {
          sub: actor.userId,
        },
      );
      const response = await api(ctx.server)
        .get('/auth/me')
        .set(bearer(forged));
      expect(response.status).toBe(401);
    });

    it('token expirado', async () => {
      const expired = await new JwtService({
        secret: process.env.JWT_SECRET,
      }).signAsync({ sub: actor.userId }, { expiresIn: -10 });
      const response = await api(ctx.server)
        .get('/auth/me')
        .set(bearer(expired));
      expect(response.status).toBe(401);
    });

    it('token válido de usuário que não existe mais', async () => {
      const ghost = await new JwtService({
        secret: process.env.JWT_SECRET,
      }).signAsync({ sub: '00000000-0000-4000-8000-000000000000' });
      const response = await api(ctx.server).get('/auth/me').set(bearer(ghost));
      expect(response.status).toBe(401);
    });

    it('token válido de usuário desativado depois do login', async () => {
      const victim = await createActor(ctx, Role.CUSTOMER);
      await api(ctx.server)
        .get('/auth/me')
        .set(bearer(victim.token))
        .expect(200);
      await ctx.prisma.user.update({
        where: { id: victim.userId },
        data: { active: false },
      });
      const response = await api(ctx.server)
        .get('/auth/me')
        .set(bearer(victim.token));
      expect(response.status).toBe(401);
    });

    it.each([
      ['GET', '/orders'],
      ['GET', '/deliveries'],
      ['GET', '/vehicles'],
      ['GET', '/drivers'],
      ['GET', '/customers'],
      ['GET', '/users'],
      ['GET', '/cep/01001000'],
      ['POST', '/deliveries'],
      ['POST', '/orders'],
    ])('%s %s exige autenticação', async (method, path) => {
      const response = await api(ctx.server)[
        method.toLowerCase() as 'get' | 'post'
      ](path);
      expect(response.status).toBe(401);
    });

    it('/health é público', async () => {
      const response = await api(ctx.server).get('/health').expect(200);
      expect(response.body.status).toBe('ok');
    });
  });
});
