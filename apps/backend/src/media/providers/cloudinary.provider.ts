import { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

import { StorageProvider } from './storage.provider';

import { UploadResult } from '../interfaces/media.interface';

@Injectable()
export class CloudinaryStorageProvider extends StorageProvider {
  private readonly logger = new Logger(CloudinaryStorageProvider.name);

  constructor(private readonly configService: ConfigService<EnvConfig>) {
    super();

    const cloudName =
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME' as keyof EnvConfig) ?? '';
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY' as keyof EnvConfig) ?? '';
    const apiSecret =
      this.configService.get<string>('CLOUDINARY_API_SECRET' as keyof EnvConfig) ?? '';

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }

  async upload(file: Express.Multer.File, key: string): Promise<UploadResult> {
    const folder = this.extractFolder(key);
    const uploadOptions: { public_id: string; resource_type: 'auto'; folder?: string } = {
      public_id: key,
      resource_type: 'auto',
    };
    if (folder !== undefined) {
      uploadOptions.folder = folder;
    }

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, uploadResult) => {
          if (error) {
            reject(new Error(error.message));
            return;
          }
          if (!uploadResult) {
            reject(new Error('Cloudinary upload returned no result'));
            return;
          }
          resolve(uploadResult);
        }
      );

      uploadStream.end(file.buffer);
    });

    this.logger.log(`File uploaded to Cloudinary: ${key}`);

    const thumbnailUrl = this.isImage(file.mimetype)
      ? cloudinary.url(result.public_id, {
          width: 200,
          height: 200,
          crop: 'thumb',
          fetch_format: 'auto',
        })
      : null;

    return {
      storageKey: result.public_id,
      url: result.secure_url,
      thumbnailUrl,
    };
  }

  async delete(key: string): Promise<void> {
    await cloudinary.uploader.destroy(key, { invalidate: true });

    this.logger.log(`File deleted from Cloudinary: ${key}`);
  }

  getSignedUrl(key: string, expiresIn: number): Promise<string> {
    const expirationTimestamp = Math.floor(Date.now() / 1000) + expiresIn;

    const signedUrl = cloudinary.utils.private_download_url(key, '', {
      type: 'authenticated',
      expires_at: expirationTimestamp,
    });

    return Promise.resolve(signedUrl);
  }

  private extractFolder(key: string): string | undefined {
    const lastSlashIndex = key.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      return undefined;
    }
    return key.substring(0, lastSlashIndex);
  }

  private isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }
}
