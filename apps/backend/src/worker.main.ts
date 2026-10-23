import { Logger } from '@nestjs/common';
import { config as loadDotenv } from 'dotenv';

// See `src/main.ts` for why `WorkerModule` must not be `require()`'d until Secrets Manager
// hydration finishes when `DEPLOYMENT_TARGET=aws`, and why `.env` must be loaded explicitly here.
async function main(): Promise<void> {
  loadDotenv();

  const { hydrateSecretsIfNeeded } = await import('@config/secrets-bootstrap');
  await hydrateSecretsIfNeeded();

  const { bootstrap } = await import('./worker-bootstrap');
  await bootstrap();
}

// A rejection nothing awaited (an event handler, a fire-and-forget write) is logged, not left to end the worker: Node's default is to exit, and one
// failed dead-letter write should not stop every queue this process serves. A real fault in `main` still exits below.
process.on('unhandledRejection', (reason: unknown) => {
  Logger.error(
    `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
    reason instanceof Error ? reason.stack : undefined,
    'Process'
  );
});

main().catch((error: unknown) => {
  Logger.error(
    `Failed to bootstrap worker: ${error instanceof Error ? error.message : String(error)}`,
    error instanceof Error ? error.stack : undefined,
    'Bootstrap'
  );
  process.exit(1);
});
