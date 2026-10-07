process.env.TZ = 'UTC';

import { Logger } from '@nestjs/common';
import { config as loadDotenv } from 'dotenv';

// AppModule reads process.env at module-evaluation time, so with DEPLOYMENT_TARGET=aws it must
// not load until Secrets Manager hydration finishes; hence the dynamic imports.
async function main(): Promise<void> {
  // Load .env first: hydration reads DEPLOYMENT_TARGET from process.env, and ConfigModule's own dotenv load only runs once AppModule is imported (too late).
  loadDotenv();

  const { hydrateSecretsIfNeeded } = await import('@config/secrets-bootstrap');
  await hydrateSecretsIfNeeded();

  const { bootstrap } = await import('./bootstrap');
  await bootstrap();
}

main().catch((error: unknown) => {
  Logger.error(
    `Failed to bootstrap application: ${error instanceof Error ? error.message : String(error)}`,
    error instanceof Error ? error.stack : undefined,
    'Bootstrap'
  );
  process.exit(1);
});
