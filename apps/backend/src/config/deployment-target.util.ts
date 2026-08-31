import type { EnvConfig } from '@config/env.config';
import { ConfigService } from '@nestjs/config';

/**
 * A standalone `ConfigService` for use before Nest's DI container exists — module-evaluation-time
 * `@Module({...})` composition, or pre-bootstrap code like `secrets-bootstrap.ts`. Mirrors the
 * `new ConfigService<EnvConfig>()` pattern already used in `app.module.ts` for the same reason;
 * reads directly from `process.env`, no `ConfigModule.forRoot()` setup required.
 */
export function createStandaloneConfigService(): ConfigService<EnvConfig> {
  return new ConfigService<EnvConfig>();
}

export function isAwsDeploymentTarget(): boolean {
  return (
    createStandaloneConfigService().get<string>('DEPLOYMENT_TARGET' as keyof EnvConfig) === 'aws'
  );
}

export function isProduction(): boolean {
  return createStandaloneConfigService().get<string>('NODE_ENV') === 'production';
}
