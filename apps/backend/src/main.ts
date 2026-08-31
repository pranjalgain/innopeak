process.env.TZ = 'UTC';

import { Logger } from '@nestjs/common';
import { config as loadDotenv } from 'dotenv';

// `AppModule` reads `process.env` at module-evaluation time (see `src/app.module.ts`), so when
// `DEPLOYMENT_TARGET=aws` it must not be `require()`'d until Secrets Manager hydration finishes.
// The dynamic `import()` calls below are the async gate that makes that ordering possible.
async function main(): Promise<void> {
  // `hydrateSecretsIfNeeded()` reads DEPLOYMENT_TARGET via a standalone ConfigService (see
  // `@config/deployment-target.util`), which itself just proxies `process.env` — so `.env` must
  // still be loaded here first, since `ConfigModule.forRoot()`'s own dotenv loading only happens
  // once `AppModule` is imported below, which is too late.
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
