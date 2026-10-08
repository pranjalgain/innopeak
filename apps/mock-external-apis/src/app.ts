import express, { type Express } from 'express';

import { azureOpenAiRouter } from './routes/azure-openai.routes';
import { gbpRouter } from './routes/gbp.routes';
import { microsoftRouter } from './routes/microsoft.routes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  // Microsoft's authorize form and token endpoint are form-encoded, like the real ones.
  app.use(express.urlencoded({ extended: false }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/azure-openai', azureOpenAiRouter);
  app.use('/', gbpRouter);
  app.use('/', microsoftRouter);

  return app;
}
