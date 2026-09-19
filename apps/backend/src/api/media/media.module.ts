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

// Same DI-swap shape as AuthModule's own `verifyEmailTokenProviderFactory` — a provider scoped to
// this module rather than a separate top-level module, since `MediaService` is its only consumer
// (unlike EmailProvider, which genuinely has many consumers across the app and lives at
// `src/email/` for that reason).
const storageProviderFactory = {
  provide: StorageProvider,
  useFactory: (configService: ConfigService<EnvConfig>): StorageProvider => {
    // Unlike EmailModule's factory, this does NOT force `noop` outside production. Sending a real,
    // unwanted email in dev is actively harmful (a stray inbox, an embarrassed test user);
    // uploading a real image to Cloudinary in dev is the opposite — it's exactly what this feature
    // needs to be testable with once real credentials exist, and forcing `noop` here would make
    // that impossible without deploying. `STORAGE_PROVIDER` defaults to `noop` so nothing requires
    // credentials until an operator explicitly opts in, in any environment.
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
 * Not `@Global()` — `MediaService` is real business logic, imported explicitly by whichever
 * modules need it for reads (`AuthModule`'s own profile-building — see `AuthService.me`), the same
 * as `PromptsModule`/`ConnectionsModule`. `StorageProvider` stays private to this module: nothing
 * outside `MediaService` talks to a storage provider directly.
 *
 * `TenantAvatarController`/`AdminAvatarController` own the upload-authorization/confirm routes
 * themselves — see `MediaService`'s own doc comment on why those live here rather than on
 * `AuthController`/`AdminSettingsController`, even though they're mounted at those controllers'
 * own route prefixes (`RouteNames.AUTH`/`RouteNames.ADMIN_SETTINGS`). NestJS registers controllers
 * by which module declares them, not by path prefix, so this needs no import back from either.
 */
@Module({
  controllers: [TenantAvatarController, AdminAvatarController],
  providers: [storageProviderFactory, MediaService],
  exports: [MediaService],
})
export class MediaModule {}
