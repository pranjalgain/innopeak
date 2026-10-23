import type { EnvConfig } from '@config/env.config';
import { isHttpsUrl, isLocalUrl } from '@config/local-environment.util';
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

/**
 * Development conveniences (the fixed sign-up code, invite links in the log) are for a machine only the developer can reach. Not
 * production is necessary but not enough: a staging box also runs as `development`, so the frontend URL has to be local too.
 */
export function isLocalDevelopment(): boolean {
  const frontendUrl = createStandaloneConfigService().get<string>(
    'FRONTEND_URL' as keyof EnvConfig
  );
  return !isProduction() && isLocalUrl(frontendUrl);
}

/** `Secure` in production, and wherever the frontend is served over https (a staging box), never on a plain-http local setup. */
export function shouldUseSecureCookies(): boolean {
  const frontendUrl = createStandaloneConfigService().get<string>(
    'FRONTEND_URL' as keyof EnvConfig
  );
  return isProduction() || isHttpsUrl(frontendUrl);
}
