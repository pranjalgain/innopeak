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

/**
 * Same factory-swap shape as `EmailModule`/`AuthModule` — the concrete class is chosen once here,
 * so nothing downstream ever branches on environment to work out which provider it holds.
 */
const reviewProviderFactory = {
  provide: ReviewProvider,
  useFactory: (configService: ConfigService<EnvConfig>): ReviewProvider => {
    const config = {
      clientId: configService.get<string>('GBP_CLIENT_ID') ?? '',
      clientSecret: configService.get<string>('GBP_CLIENT_SECRET') ?? '',
      callbackUrl: configService.get<string>('GBP_CALLBACK_URL') ?? '',
    };

    // Belt and braces with the Joi schema's `Joi.forbidden()` in production: that rejects the env
    // var at boot, and this refuses to honour it even if some other path sets it. A mocked
    // business connection is indistinguishable from a real one once it is a row in Postgres, so
    // "impossible in production" is worth stating twice.
    const mockEnabled = configService.get<string>('DEV_GBP_MOCK') === 'true' && !isProduction();

    if (mockEnabled) {
      logger.warn(
        'Google Business Profile provider: MOCK (DEV_GBP_MOCK=true). Connections created now are backed by fixtures, not a real Google account.'
      );
      return new MockGoogleBusinessProfileProvider({
        ...config,
        // An empty env var means "unset", not "override with an empty account id" — `??` would
        // treat '' as a real value and produce a connection whose provider_account_id is blank.
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
 * Local Redis in plain local development, Secrets Manager in production **and** in the
 * Floci-emulated AWS local stack (`isAwsDeploymentTarget()`, so `DEPLOYMENT_TARGET=aws` gets real
 * Secrets Manager semantics to develop against, not the plain-Redis store).
 *
 * `isProduction()` alone would not be enough: the Redis store's encryption key sits in the same
 * `.env` as everything else, which is fine for plain local development but is not a trust boundary
 * once Secrets Manager is in the loop at all. Making the local store *throw* rather than silently
 * not be selected means a production node can never end up persisting refresh tokens in Redis
 * because someone got a deployment variable wrong.
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

/**
 * `@Global()` for the same reason `EmailModule` is: the backfill job runs inside `WorkerModule`,
 * which never imports API modules, and both processes need the same provider and credential
 * resolution. See ReviewProvider's class doc.
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [reviewProviderFactory, credentialStoreFactory, ProviderCredentialService],
  exports: [ReviewProvider, CredentialStoreProvider, ProviderCredentialService],
})
export class ReviewProviderModule {}
