import { EnvConfig } from '@config/env.config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { StorageProviderType } from './interfaces/media.interface';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { CloudinaryStorageProvider } from './providers/cloudinary.provider';
import { S3StorageProvider } from './providers/s3.provider';
import { StorageProvider } from './providers/storage.provider';

@Module({
  imports: [ConfigModule],
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      provide: StorageProvider,
      useFactory: (configService: ConfigService<EnvConfig>): StorageProvider => {
        const provider = (configService.get<string>('STORAGE_PROVIDER' as keyof EnvConfig) ??
          StorageProviderType.S3) as StorageProviderType;

        switch (provider) {
          case StorageProviderType.CLOUDINARY:
            return new CloudinaryStorageProvider(configService);

          case StorageProviderType.S3:
          default:
            return new S3StorageProvider(configService);
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
