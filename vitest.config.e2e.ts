import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import { TEST_API_KEY } from './test/helpers/constants.js';
import { testDatabaseUrl } from './test/helpers/test-database.js';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl(process.env.DATABASE_URL),
      UPLOAD_DIR: 'uploads-test',
      UPLOAD_MAX_SIZE_BYTES: '1048576',
      CEP_API_BASE_URL: 'http://127.0.0.1:4010',
      CEP_API_TIMEOUT_MS: '400',
      API_KEY: TEST_API_KEY,
    },
  },
});
