import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import {
  LicenseCategory,
  PrismaClient,
  Role,
  VehicleType,
} from '../src/generated/prisma/client.js';

const isProduction = process.env.NODE_ENV === 'production';
const password = process.env.SEED_PASSWORD ?? 'Senha@1234';

if (isProduction && !process.env.SEED_PASSWORD) {
  throw new Error('Defina SEED_PASSWORD para rodar o seed em produção');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function upsertUser(name: string, email: string, role: Role) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, role, passwordHash },
  });
}

async function main() {
  await upsertUser('Administrador', 'admin@logistica.local', Role.ADMIN);
  await upsertUser('Operador', 'operador@logistica.local', Role.OPERATOR);

  const driverUser = await upsertUser(
    'Carlos Motorista',
    'motorista@logistica.local',
    Role.DRIVER,
  );
  await prisma.driver.upsert({
    where: { userId: driverUser.id },
    update: {},
    create: {
      userId: driverUser.id,
      licenseNumber: '12345678901',
      licenseCategory: LicenseCategory.B,
      licenseExpiresAt: new Date('2035-12-31'),
      phone: '11999990001',
    },
  });

  const motoUser = await upsertUser(
    'Marta Motoqueira',
    'moto@logistica.local',
    Role.DRIVER,
  );
  await prisma.driver.upsert({
    where: { userId: motoUser.id },
    update: {},
    create: {
      userId: motoUser.id,
      licenseNumber: '10987654321',
      licenseCategory: LicenseCategory.A,
      licenseExpiresAt: new Date('2035-12-31'),
      phone: '11999990002',
    },
  });

  const customerUser = await upsertUser(
    'Cliente Exemplo',
    'cliente@logistica.local',
    Role.CUSTOMER,
  );
  await prisma.customer.upsert({
    where: { userId: customerUser.id },
    update: {},
    create: {
      userId: customerUser.id,
      document: '12345678909',
      phone: '11988880001',
    },
  });

  const vehicles = [
    {
      plate: 'ABC1D23',
      model: 'Fiat Fiorino',
      type: VehicleType.VAN,
      capacityKg: 650,
    },
    {
      plate: 'MOT0A00',
      model: 'Honda CG 160',
      type: VehicleType.MOTORCYCLE,
      capacityKg: 25,
    },
    {
      plate: 'CAM1E45',
      model: 'Mercedes Accelo',
      type: VehicleType.TRUCK,
      capacityKg: 4000,
    },
  ];
  for (const vehicle of vehicles) {
    await prisma.vehicle.upsert({
      where: { plate: vehicle.plate },
      update: {},
      create: vehicle,
    });
  }

  console.log(
    'Seed concluído. Usuários (senha: %s):',
    isProduction ? '<SEED_PASSWORD>' : password,
  );
  console.log('  ADMIN     admin@logistica.local');
  console.log('  OPERATOR  operador@logistica.local');
  console.log(
    '  DRIVER    motorista@logistica.local (CNH B)  |  moto@logistica.local (CNH A)',
  );
  console.log('  CUSTOMER  cliente@logistica.local');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
