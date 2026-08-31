import type { EnvConfig } from '@config/env.config';

interface ConfigServiceLike {
  get: <T = string>(key: keyof EnvConfig) => T | undefined;
}

/**
 * Shared by every AWS SDK client construction (S3, SES, SNS, SQS, Secrets Manager) so pointing
 * at Floci instead of real AWS is a one-line addition per provider rather than duplicated env-var
 * logic. Returns `undefined` outside `DEPLOYMENT_TARGET=aws`, which leaves the AWS SDK's default
 * endpoint resolution (real AWS) untouched.
 */
export function getAwsEndpointOverride(configService: ConfigServiceLike): string | undefined {
  if (configService.get<string>('DEPLOYMENT_TARGET') !== 'aws') {
    return undefined;
  }
  return configService.get<string>('FLOCI_ENDPOINT');
}

/**
 * Floci accepts any credentials, but the AWS SDK v3's default credential provider chain still
 * throws `CredentialsProviderError` if none are configured (env vars, shared config, IMDS, etc.)
 * — so every client construction needs an explicit static-credentials fallback while pointed at
 * Floci. Returns `undefined` outside `DEPLOYMENT_TARGET=aws`, leaving the default chain untouched
 * for real AWS.
 */
export function getFlociCredentials(
  configService: ConfigServiceLike
): { accessKeyId: string; secretAccessKey: string } | undefined {
  return getAwsEndpointOverride(configService)
    ? { accessKeyId: 'test', secretAccessKey: 'test' }
    : undefined;
}
