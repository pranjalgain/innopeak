import type { EnvConfig } from '@config/env.config';
import { ConfigService } from '@nestjs/config';

/** Standalone `ConfigService` for use before Nest's DI container exists (module-evaluation-time composition, pre-bootstrap code); reads `process.env` directly. */
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
