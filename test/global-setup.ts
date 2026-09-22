import 'dotenv/config';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import {
  databaseName,
  maintenanceDatabaseUrl,
  testDatabaseUrl,
} from './helpers/test-database.js';

export default async function setup() {
  const baseUrl = process.env.DATABASE_URL;
  const testUrl = testDatabaseUrl(baseUrl);
  const name = databaseName(testUrl);
  if (!/^\w+$/.test(name)) throw new Error(`Nome de banco inválido: ${name}`);

  const admin = new pg.Client({
    connectionString: maintenanceDatabaseUrl(baseUrl!),
  });
  await admin.connect();
  try {
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });

  return () => {
    rmSync(resolve(process.cwd(), 'uploads-test'), {
      recursive: true,
      force: true,
    });
  };
}
