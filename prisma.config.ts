import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // process.env (e não env()) para que `prisma generate` e `npm run build`
    // funcionem mesmo sem .env. Comandos de migration ainda exigem a URL.
    url: process.env['DATABASE_URL'],
  },
});
