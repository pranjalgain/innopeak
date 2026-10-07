import { getLocalMockServerUrl } from '@common/helpers/local-mock-server.util';
import { isAwsDeploymentTarget, isProduction } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisModule } from '@redis/redis.module';
import { REDIS_CLIENT } from '@redis/redis.provider';
import type Redis from 'ioredis';

import { ProviderCredentialService } from './provider-credential.service';
import { AwsSecretsManagerCredentialStoreProvider } from './providers/aws-secrets-manager-credential-store.provider';
import { CredentialStoreProvider } from './providers/credential-store.provider';
import { GoogleBusinessProfileProvider } from './providers/google-business-profile.provider';
import { LocalRedisCredentialStoreProvider } from './providers/local-redis-credential-store.provider';
import { MockGoogleBusinessProfileProvider } from './providers/mock-google-business-profile.provider';
import { ReviewProvider } from './providers/review-provider.provider';

const logger = new Logger('ReviewProviderModule');

const reviewProviderFactory = {
  provide: ReviewProvider,
  useFactory: (configService: ConfigService<EnvConfig>): ReviewProvider => {
    const localMockServerUrl = getLocalMockServerUrl(configService);
    const config = {
      clientId: configService.get<string>('GBP_CLIENT_ID') ?? '',
      clientSecret: configService.get<string>('GBP_CLIENT_SECRET') ?? '',
      callbackUrl: configService.get<string>('GBP_CALLBACK_URL') ?? '',
      // Independent of DEV_GBP_MOCK: it only affects the write-path methods the mock subclass doesn't override.
      ...(localMockServerUrl !== undefined ? { localMockServerUrl } : {}),
    };

    // Also enforced by the Joi schema; repeated because a mocked connection is indistinguishable from a real one once stored.
    const mockEnabled = configService.get<string>('DEV_GBP_MOCK') === 'true' && !isProduction();

    if (mockEnabled) {
      logger.warn(
        'Google Business Profile provider: MOCK (DEV_GBP_MOCK=true). Connections created now are backed by fixtures, not a real Google account.'
      );
      return new MockGoogleBusinessProfileProvider({
        ...config,
        // An empty env var means unset; `??` alone would treat '' as a real (blank) account id.
        accountIdOverride:
          configService.get<string>('DEV_GBP_MOCK_ACCOUNT_ID')?.trim() ?? undefined,
      });
    }

    logger.log('Google Business Profile provider: google');
    return new GoogleBusinessProfileProvider(config);
  },
  inject: [ConfigService],
};

/**
 * Secrets Manager in production and the Floci-emulated `aws` target, local Redis otherwise.
 * `isProduction()` alone isn't enough: the Redis store's key lives in `.env`, which is no trust
 * boundary, so a misconfigured production node must never persist refresh tokens in Redis.
 */
const credentialStoreFactory = {
  provide: CredentialStoreProvider,
  useFactory: (configService: ConfigService<EnvConfig>, redis: Redis): CredentialStoreProvider => {
    if (isProduction() || isAwsDeploymentTarget()) {
      const env = configService.get<string>('NODE_ENV') ?? 'development';
      return new AwsSecretsManagerCredentialStoreProvider(
        `innopeak/${env}/review-credentials`,
        configService
      );
    }

    const encryptionKey = configService.get<string>('CREDENTIAL_ENCRYPTION_KEY') ?? '';

    if (!encryptionKey) {
      throw new Error(
        'CREDENTIAL_ENCRYPTION_KEY must be set to store review-provider credentials locally. Generate one with: openssl rand -base64 32'
      );
    }

    return new LocalRedisCredentialStoreProvider(redis, encryptionKey);
  },
  inject: [ConfigService, REDIS_CLIENT],
};

// Global because the backfill runs in WorkerModule, which imports no API modules.
@Global()
@Module({
  imports: [RedisModule],
  providers: [reviewProviderFactory, credentialStoreFactory, ProviderCredentialService],
  exports: [ReviewProvider, CredentialStoreProvider, ProviderCredentialService],
})
export class ReviewProviderModule {}
