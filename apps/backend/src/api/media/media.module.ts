import type { EnvConfig } from '@config/env.config';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AdminAvatarController } from './controllers/admin-avatar.controller';
import { TenantAvatarController } from './controllers/tenant-avatar.controller';
import { MediaService } from './media.service';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider';
import { NoopStorageProvider } from './providers/noop-storage.provider';
import { StorageProvider } from './providers/storage.provider';
import type { StorageProviderType } from './types/storage-provider.type';

const logger = new Logger('MediaModule');

// Provider scoped to this module because `MediaService` is its only consumer.
const storageProviderFactory = {
  provide: StorageProvider,
  useFactory: (configService: ConfigService<EnvConfig>): StorageProvider => {
    // Unlike EmailModule's factory, this does not force `noop` outside production: uploading to Cloudinary in dev
    // is what makes the feature testable. `STORAGE_PROVIDER` defaults to `noop` until an operator opts in.
    const providerType =
      (configService.get<string>('STORAGE_PROVIDER') as StorageProviderType | undefined) ?? 'noop';

    logger.log(`Initializing storage provider: ${providerType}`);

    switch (providerType) {
      case 'cloudinary':
        return new CloudinaryStorageProvider(configService);
      case 'noop':
      default:
        return new NoopStorageProvider();
    }
  },
  inject: [ConfigService],
};

/**
 * Not `@Global()`: modules needing reads import `MediaService` explicitly; `StorageProvider` stays private. The avatar
 * controllers live here though mounted at other controllers' prefixes, since Nest registers controllers by declaring module.
 */
@Module({
  controllers: [TenantAvatarController, AdminAvatarController],
  providers: [storageProviderFactory, MediaService],
  exports: [MediaService],
})
export class MediaModule {}
