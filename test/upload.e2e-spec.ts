import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { Role } from '../src/generated/prisma/client.js';
import { createTestApp, resetDatabase, type TestApp } from './helpers/app.js';
import {
  api,
  JPEG_BYTES,
  PDF_BYTES,
  PNG_BYTES,
  assignDelivery,
  bearer,
  createActor,
  createOrder,
  createVehicle,
  type Actor,
} from './helpers/factories.js';

const proofDir = resolve(process.cwd(), 'uploads-test', 'proofs');
const storedFiles = () => (existsSync(proofDir) ? readdirSync(proofDir) : []);

describe('Upload de comprovante de entrega', () => {
  let ctx: TestApp;
  let operator: Actor;
  let customer: Actor;
  let driver: Actor;
  let deliveryId: string;

  const upload = (
    id: string,
    token: string,
    content: Buffer | null,
    options: { filename?: string; contentType?: string } = {},
  ) => {
    const req = api(ctx.server)
      .post(`/deliveries/${id}/proof`)
      .set(bearer(token));
    return content
      ? req.attach('file', content, {
          filename: options.filename ?? 'comprovante.png',
          contentType: options.contentType ?? 'image/png',
        })
      : req;
  };

  beforeAll(async () => {
    rmSync(proofDir, { recursive: true, force: true });
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    operator = await createActor(ctx, Role.OPERATOR);
    customer = await createActor(ctx, Role.CUSTOMER);
    driver = await createActor(ctx, Role.DRIVER);
    const vehicle = await createVehicle(ctx.prisma);
    const order = await createOrder(ctx, customer);
    const delivery = await assignDelivery(ctx, operator, {
      orderId: order.id,
      driverId: driver.driverId!,
      vehicleId: vehicle.id,
    }).then((r) => r.body);
    deliveryId = delivery.id;

    for (const status of ['PICKED_UP', 'IN_TRANSIT']) {
      await api(ctx.server)
        .patch(`/deliveries/${deliveryId}/status`)
        .set(bearer(driver.token))
        .send({ status })
        .expect(200);
    }
  });

  afterAll(() => ctx.close());

  describe('uploads inválidos', () => {
    it('400 quando o arquivo não é enviado', async () => {
      const response = await upload(deliveryId, driver.token, null);
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('"file"');
    });

    it('400 para arquivo vazio', async () => {
      const response = await upload(deliveryId, driver.token, Buffer.alloc(0));
      expect(response.status).toBe(400);
    });

    it('400 para tipo não permitido (texto)', async () => {
      const response = await upload(
        deliveryId,
        driver.token,
        Buffer.from('conteudo qualquer'),
        {
          filename: 'notas.txt',
          contentType: 'text/plain',
        },
      );
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Tipo de arquivo não permitido');
    });

    it('400 para arquivo que finge ser imagem (extensão e Content-Type falsos, conteúdo de texto)', async () => {
      const response = await upload(
        deliveryId,
        driver.token,
        Buffer.from('<script>alert(1)</script>'),
        {
          filename: 'foto.png',
          contentType: 'image/png',
        },
      );
      expect(response.status).toBe(400);
    });

    it('400 quando o Content-Type declarado diverge do conteúdo real', async () => {
      const response = await upload(deliveryId, driver.token, PDF_BYTES, {
        filename: 'x.png',
        contentType: 'image/png',
      });
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('não corresponde');
    });

    it('413 para arquivo acima do limite configurado', async () => {
      const huge = Buffer.concat([
        PNG_BYTES,
        Buffer.alloc(1024 * 1024 + 1024, 1),
      ]);
      const response = await upload(deliveryId, driver.token, huge);
      expect(response.status).toBe(413);
    });

    it('nenhum arquivo inválido foi gravado em disco', () => {
      expect(storedFiles()).toHaveLength(0);
    });

    it('409 quando a entrega não está em trânsito', async () => {
      const other = await createActor(ctx, Role.DRIVER);
      const vehicle = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);
      const fresh = await assignDelivery(ctx, operator, {
        orderId: order.id,
        driverId: other.driverId!,
        vehicleId: vehicle.id,
      }).then((r) => r.body);
      const response = await upload(fresh.id, other.token, PNG_BYTES);
      expect(response.status).toBe(409);
    });

    it('401 sem token, 403 para cliente, 404 para entrega inexistente', async () => {
      await api(ctx.server)
        .post(`/deliveries/${deliveryId}/proof`)
        .attach('file', PNG_BYTES, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(401);
      expect((await upload(deliveryId, customer.token, PNG_BYTES)).status).toBe(
        403,
      );
      expect(
        (
          await upload(
            '00000000-0000-4000-8000-000000000001',
            driver.token,
            PNG_BYTES,
          )
        ).status,
      ).toBe(404);
    });
  });

  describe('uploads válidos', () => {
    it('aceita PNG e guarda apenas metadados seguros na resposta', async () => {
      const response = await upload(deliveryId, driver.token, PNG_BYTES);
      expect(response.status).toBe(201);
      expect(response.body.proof).toMatchObject({
        originalName: 'comprovante.png',
        mimeType: 'image/png',
        size: PNG_BYTES.length,
      });
      expect(JSON.stringify(response.body)).not.toContain('proofPath');
      expect(storedFiles()).toHaveLength(1);
    });

    it('novo envio substitui o anterior e remove o arquivo antigo do disco', async () => {
      const response = await upload(deliveryId, driver.token, PDF_BYTES, {
        filename: 'recibo.pdf',
        contentType: 'application/pdf',
      });
      expect(response.status).toBe(201);
      expect(response.body.proof.mimeType).toBe('application/pdf');

      const files = storedFiles();
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/\.pdf$/);
    });

    it('aceita JPEG', async () => {
      const response = await upload(deliveryId, driver.token, JPEG_BYTES, {
        filename: 'foto.jpg',
        contentType: 'image/jpeg',
      });
      expect(response.status).toBe(201);
      expect(storedFiles()[0]).toMatch(/\.jpg$/);
    });

    it('o nome enviado pelo cliente nunca vira caminho no disco (path traversal)', async () => {
      const response = await upload(deliveryId, driver.token, PNG_BYTES, {
        filename: '../../../evil.png',
        contentType: 'image/png',
      });
      expect(response.status).toBe(201);
      expect(response.body.proof.originalName).toBe('evil.png');
      expect(existsSync(resolve(process.cwd(), 'evil.png'))).toBe(false);
      expect(storedFiles()).toHaveLength(1);
      expect(storedFiles()[0]).toMatch(/^[0-9a-f-]{36}\.png$/);
    });

    it('após o envio, a entrega pode ser concluída e o comprovante é baixado com o tipo correto', async () => {
      await api(ctx.server)
        .patch(`/deliveries/${deliveryId}/status`)
        .set(bearer(driver.token))
        .send({ status: 'DELIVERED' })
        .expect(200);

      const download = await api(ctx.server)
        .get(`/deliveries/${deliveryId}/proof`)
        .set(bearer(operator.token))
        .expect(200);
      expect(download.headers['content-type']).toContain('image/png');
      expect(download.headers['content-disposition']).toContain('comprovante-');
    });

    it('404 ao baixar comprovante de entrega que não tem arquivo', async () => {
      const other = await createActor(ctx, Role.DRIVER);
      const vehicle = await createVehicle(ctx.prisma);
      const order = await createOrder(ctx, customer);
      const fresh = await assignDelivery(ctx, operator, {
        orderId: order.id,
        driverId: other.driverId!,
        vehicleId: vehicle.id,
      }).then((r) => r.body);
      await api(ctx.server)
        .get(`/deliveries/${fresh.id}/proof`)
        .set(bearer(operator.token))
        .expect(404);
    });
  });
});
