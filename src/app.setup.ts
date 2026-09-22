import type { INestApplication } from '@nestjs/common';
import compression from 'compression';
import helmet from 'helmet';

export function configureApp(app: INestApplication) {
  app.use(helmet());
  app.use(compression());
  app.enableShutdownHooks();
}
