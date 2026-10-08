import express, { type Express } from 'express';

import { azureOpenAiRouter } from './routes/azure-openai.routes';
import { gbpRouter } from './routes/gbp.routes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/azure-openai', azureOpenAiRouter);
  app.use('/', gbpRouter);

  return app;
}
