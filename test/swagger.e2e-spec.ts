import request from 'supertest';
import { createTestApp, type TestApp } from './helpers/app.js';

describe('Documentação Swagger (/docs)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(() => ctx.close());

  it('/docs carrega mesmo sem X-API-KEY (exceção deliberada)', async () => {
    const response = await request(ctx.server).get('/docs');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });

  it('/docs-json carrega mesmo sem X-API-KEY e é um documento OpenAPI 3 válido', async () => {
    const response = await request(ctx.server).get('/docs-json');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toMatch(/^3\./);
    expect(response.body.info.title).toBe('API de Logística e Entregas');
    expect(Object.keys(response.body.paths).length).toBeGreaterThan(0);
  });

  it('exige X-API-KEY e Bearer por padrão (as duas, ao mesmo tempo) em toda rota de negócio', async () => {
    const response = await request(ctx.server).get('/docs-json');
    expect(response.body.security).toEqual([{ ApiKey: [], JWT: [] }]);

    const protectedOp = response.body.paths['/orders'].get;
    expect(protectedOp.security).toBeUndefined(); // undefined = herda o padrão acima
  });

  it('as 3 rotas públicas (sem Bearer) sobrescrevem a exigência para exigir só a X-API-KEY', () => {
    return request(ctx.server)
      .get('/docs-json')
      .then((response) => {
        for (const [path, method] of [
          ['/health', 'get'],
          ['/auth/register', 'post'],
          ['/auth/login', 'post'],
        ] as const) {
          expect(response.body.paths[path][method].security, path).toEqual([
            { ApiKey: [] },
          ]);
        }
      });
  });

  it('documenta os 41 endpoints da API', async () => {
    const response = await request(ctx.server).get('/docs-json');
    const total = Object.values(
      response.body.paths as Record<string, Record<string, unknown>>,
    ).reduce((sum, methods) => sum + Object.keys(methods).length, 0);
    expect(total).toBe(41);
  });
});
