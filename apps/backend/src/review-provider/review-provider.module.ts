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
import { ReviewProvider } from './providers/review-provider.provider';

const logger = new Logger('ReviewProviderModule');

const reviewProviderFactory = {
  provide: ReviewProvider,
  useFactory: (configService: ConfigService<EnvConfig>): ReviewProvider => {
    logger.log('Google Business Profile provider: google');
    return new GoogleBusinessProfileProvider({
      clientId: configService.get<string>('GBP_CLIENT_ID') ?? '',
      clientSecret: configService.get<string>('GBP_CLIENT_SECRET') ?? '',
      callbackUrl: configService.get<string>('GBP_CALLBACK_URL') ?? '',
    });
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
