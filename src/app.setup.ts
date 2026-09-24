import type { INestApplication } from '@nestjs/common';
import compression from 'compression';
import helmet from 'helmet';
import { setupSwagger } from './swagger.setup.js';

export function configureApp(app: INestApplication) {
  app.use(helmet());
  app.use(compression());
  app.enableShutdownHooks();
  setupSwagger(app);
}
