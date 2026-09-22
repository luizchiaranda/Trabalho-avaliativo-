import request from 'supertest';
import type { Server } from 'node:http';
import {
  LicenseCategory,
  Role,
  VehicleType,
} from '../../src/generated/prisma/client.js';
import { hashPassword } from '../../src/common/utils/password.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import type { TestApp } from './app.js';
import { CEP } from './cep-mock.js';
import { TEST_API_KEY } from './constants.js';

export const TEST_PASSWORD = 'Senha@1234';

let counter = 0;
const next = () => ++counter;

let cachedHash: string | undefined;
async function passwordHash() {
  cachedHash ??= await hashPassword(TEST_PASSWORD);
  return cachedHash;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Substitui `request(ctx.server)` nos testes: já anexa a X-API-KEY válida,
 * para que cada teste possa continuar isolando o que quer verificar (token,
 * papel, body) sem precisar repetir o cabeçalho em toda chamada.
 */
export function api(server: Server) {
  const withKey = <T extends { set: (field: string, value: string) => T }>(
    req: T,
  ) => req.set('X-Api-Key', TEST_API_KEY);
  return {
    get: (path: string) => withKey(request(server).get(path)),
    post: (path: string) => withKey(request(server).post(path)),
    patch: (path: string) => withKey(request(server).patch(path)),
    delete: (path: string) => withKey(request(server).delete(path)),
  };
}

export interface Actor {
  token: string;
  userId: string;
  email: string;
  customerId?: string;
  driverId?: string;
}

export async function createActor(
  ctx: TestApp,
  role: Role,
  overrides: {
    licenseCategory?: LicenseCategory;
    licenseExpiresAt?: Date;
    driverActive?: boolean;
    name?: string;
  } = {},
): Promise<Actor> {
  const n = next();
  const email = `${role.toLowerCase()}${n}@teste.com`;
  const user = await ctx.prisma.user.create({
    data: {
      name: overrides.name ?? `${role} ${n}`,
      email,
      role,
      passwordHash: await passwordHash(),
    },
  });

  let customerId: string | undefined;
  let driverId: string | undefined;

  if (role === Role.CUSTOMER) {
    const customer = await ctx.prisma.customer.create({
      data: {
        userId: user.id,
        document: String(20000000000 + n),
        phone: '11988887777',
      },
    });
    customerId = customer.id;
  }
  if (role === Role.DRIVER) {
    const driver = await ctx.prisma.driver.create({
      data: {
        userId: user.id,
        licenseNumber: String(10000000000 + n),
        licenseCategory: overrides.licenseCategory ?? LicenseCategory.B,
        licenseExpiresAt: overrides.licenseExpiresAt ?? new Date('2035-12-31'),
        phone: '11977776666',
        active: overrides.driverActive ?? true,
      },
    });
    driverId = driver.id;
  }

  const token = await login(ctx, email);
  return { token, userId: user.id, email, customerId, driverId };
}

export async function login(
  ctx: TestApp,
  email: string,
  password = TEST_PASSWORD,
) {
  const response = await api(ctx.server)
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return response.body.accessToken as string;
}

export async function createVehicle(
  prisma: PrismaService,
  overrides: Partial<{
    type: VehicleType;
    capacityKg: number;
    status: 'AVAILABLE' | 'MAINTENANCE' | 'INACTIVE';
  }> = {},
) {
  const n = next();
  return prisma.vehicle.create({
    data: {
      plate: `TST${n % 10}A${String(n % 100).padStart(2, '0')}`,
      model: 'Veículo de teste',
      type: overrides.type ?? VehicleType.VAN,
      capacityKg: overrides.capacityKg ?? 500,
      status: overrides.status ?? 'AVAILABLE',
    },
  });
}

export function orderPayload(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Caixa de documentos',
    weightKg: 10,
    origin: { cep: CEP.SAO_PAULO, number: '100' },
    destination: { cep: CEP.RIO, number: '200', complement: 'Sala 3' },
    ...overrides,
  };
}

export async function createOrder(
  ctx: TestApp,
  customer: Actor,
  overrides: Record<string, unknown> = {},
) {
  const response = await api(ctx.server)
    .post('/orders')
    .set(bearer(customer.token))
    .send(orderPayload(overrides))
    .expect(201);
  return response.body as { id: string; status: string };
}

export async function assignDelivery(
  ctx: TestApp,
  operator: Actor,
  ids: { orderId: string; driverId: string; vehicleId: string },
) {
  return api(ctx.server)
    .post('/deliveries')
    .set(bearer(operator.token))
    .send(ids);
}

export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
export const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 1),
]);
export const PDF_BYTES = Buffer.from('%PDF-1.4\n% comprovante de teste\n');
