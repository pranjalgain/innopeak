import { Module } from '@nestjs/common';

import { AdminAvatarController } from './controllers/admin-avatar.controller';
import { TenantAvatarController } from './controllers/tenant-avatar.controller';
import { MediaService } from './media.service';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider';
import { StorageProvider } from './providers/storage.provider';

// Provider scoped to this module because `MediaService` is its only consumer. Cloudinary only: there is no offline stand-in.
const storageProviderBinding = { provide: StorageProvider, useClass: CloudinaryStorageProvider };

/**
 * Not `@Global()`: modules needing reads import `MediaService` explicitly; `StorageProvider` stays private. The avatar
 * controllers live here though mounted at other controllers' prefixes, since Nest registers controllers by declaring module.
 */
@Module({
  controllers: [TenantAvatarController, AdminAvatarController],
  providers: [storageProviderBinding, MediaService],
  exports: [MediaService],
})
export class MediaModule {}
