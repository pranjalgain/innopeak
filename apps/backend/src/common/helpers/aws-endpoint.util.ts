import type { EnvConfig } from '@config/env.config';

interface ConfigServiceLike {
  get: <T = string>(key: keyof EnvConfig) => T | undefined;
}

/** Returns `undefined` outside `DEPLOYMENT_TARGET=aws`, leaving the AWS SDK's default endpoint resolution untouched. */
export function getAwsEndpointOverride(configService: ConfigServiceLike): string | undefined {
  if (configService.get<string>('DEPLOYMENT_TARGET') !== 'aws') {
    return undefined;
  }
  return configService.get<string>('FLOCI_ENDPOINT');
}

/**
 * Floci accepts any credentials, but the SDK v3 default chain still throws `CredentialsProviderError`
 * when none are configured, so a static fallback is needed while pointed at Floci. `undefined` outside `DEPLOYMENT_TARGET=aws`.
 */
export function getFlociCredentials(
  configService: ConfigServiceLike
): { accessKeyId: string; secretAccessKey: string } | undefined {
  return getAwsEndpointOverride(configService)
    ? { accessKeyId: 'test', secretAccessKey: 'test' }
    : undefined;
}
