import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { createStandaloneConfigService } from '@config/deployment-target.util';
import type { EnvConfig } from '@config/env.config';

/**
 * Must run before `AppModule`/`WorkerModule` are `require()`'d: `app.module.ts` builds a `ConfigService` at
 * module-eval time, so `process.env` must already be populated; a dynamic `import()` gate gives that ordering under CommonJS.
 */
export async function hydrateSecretsIfNeeded(): Promise<void> {
  const configService = createStandaloneConfigService();

  if (configService.get<string>('DEPLOYMENT_TARGET' as keyof EnvConfig) !== 'aws') {
    return;
  }

  const secretId =
    configService.get<string>('SECRETS_MANAGER_SECRET_ID' as keyof EnvConfig) ??
    `nestjs-app/${configService.get<string>('NODE_ENV') ?? 'development'}`;
  const endpoint = configService.get<string>('FLOCI_ENDPOINT' as keyof EnvConfig);

  const client = new SecretsManagerClient({
    region: configService.get<string>('AWS_REGION' as keyof EnvConfig) ?? 'us-east-1',
    ...(endpoint
      ? { endpoint, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }
      : {}),
  });

  const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!SecretString) {
    return;
  }

  // Terraform seeds one flat JSON object of string values (infra/floci/secrets-manager.tf); every key becomes an env var.
  const secrets = JSON.parse(SecretString) as Record<string, string>;
  for (const [key, value] of Object.entries(secrets)) {
    process.env[key] = value;
  }
}
