import type { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

import { StorageProvider } from './storage.provider';

import {
  type CreateUploadAuthorizationInput,
  StorageAssetNotFoundError,
  type UploadAuthorization,
  type VerifyUploadResult,
} from '../types/storage-provider.type';

// Cloudinary's `format` is a bare extension, not a MIME type. `svg` is deliberately excluded: it can
// carry a `<script>` and `media.url` is rendered unsanitized in `<img src>` (stored-XSS vector).
const FORMAT_TO_MIME_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
};

// Signed so Cloudinary rejects wrong-format uploads before storing them: the authorization goes to
// the browser, so any constraint outside the signature is one the client can simply drop.
// `allowed_formats` mirrors `FORMAT_TO_MIME_TYPE`'s keys.
const ALLOWED_UPLOAD_FORMATS = Object.keys(FORMAT_TO_MIME_TYPE).join(',');
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@Injectable()
export class CloudinaryStorageProvider extends StorageProvider {
  readonly type = 'cloudinary' as const;
  private readonly logger = new Logger(CloudinaryStorageProvider.name);
  private readonly cloudName: string;

  constructor(configService: ConfigService<EnvConfig>) {
    super();
    this.cloudName = configService.get<string>('CLOUDINARY_CLOUD_NAME') ?? '';
    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: configService.get<string>('CLOUDINARY_API_KEY') ?? '',
      api_secret: configService.get<string>('CLOUDINARY_API_SECRET') ?? '',
      secure: true,
    });
  }

  createUploadAuthorization(input: CreateUploadAuthorizationInput): Promise<UploadAuthorization> {
    const timestamp = Math.floor(Date.now() / 1000);
    // Must match every param the client sends (except `file`/`api_key`/`cloud_name`) or Cloudinary
    // rejects the signature. `folder` is owner-scoped, so tampering with it invalidates the signature.
    // `max_file_size` is deliberately absent: Cloudinary drops it from its expected signature, so
    // signing it rejects *every* upload. Size is enforced in `verifyUpload` instead.
    const paramsToSign = {
      timestamp,
      folder: input.folder,
      allowed_formats: ALLOWED_UPLOAD_FORMATS,
    };
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      cloudinary.config().api_secret ?? ''
    );

    return Promise.resolve({
      provider: 'cloudinary',
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      formFields: {
        api_key: cloudinary.config().api_key ?? '',
        signature,
        timestamp: String(timestamp),
        folder: input.folder,
        allowed_formats: ALLOWED_UPLOAD_FORMATS,
      },
    });
  }

  async verifyUpload(providerAssetId: string, expectedFolder: string): Promise<VerifyUploadResult> {
    // `asset_folder`, not `folder`: in Cloudinary's "dynamic folder" mode (default for newer
    // accounts) the Admin API reports the folder via `asset_folder` and leaves `folder` empty.
    let resource: { secure_url: string; format: string; bytes: number; asset_folder?: string };
    try {
      // Server-to-Cloudinary read: makes this trustworthy rather than a rubber stamp on the client's claim.
      resource = (await cloudinary.api.resource(providerAssetId, {
        resource_type: 'image',
      })) as typeof resource;
    } catch (error) {
      this.logger.warn(
        `Could not verify Cloudinary asset "${providerAssetId}": ${error instanceof Error ? error.message : String(error)}`
      );
      return { ok: false, reason: 'notFound' };
    }

    if (resource.asset_folder !== expectedFolder) {
      this.logger.warn(
        `Cloudinary asset "${providerAssetId}" is in folder "${resource.asset_folder ?? ''}", expected "${expectedFolder}" — refusing to confirm it.`
      );
      return { ok: false, reason: 'notFound' };
    }

    const mimeType = FORMAT_TO_MIME_TYPE[resource.format];
    if (!mimeType) {
      this.logger.warn(
        `Cloudinary asset "${providerAssetId}" has an unexpected format "${resource.format}".`
      );
      return { ok: false, reason: 'unsupportedFormat' };
    }

    // The size cap can't ride in the signature (see `createUploadAuthorization`): an oversized file may reach Cloudinary but never becomes an avatar.
    if (resource.bytes > MAX_UPLOAD_BYTES) {
      this.logger.warn(
        `Cloudinary asset "${providerAssetId}" is ${String(resource.bytes)} bytes, over the ${String(MAX_UPLOAD_BYTES)}-byte limit.`
      );
      return { ok: false, reason: 'tooLarge' };
    }

    return { ok: true, upload: { url: resource.secure_url, mimeType, sizeBytes: resource.bytes } };
  }

  /** `uploader.destroy` *resolves* for failures too, so anything but 'ok' must throw or the caller's best-effort `.catch()` never fires and orphaned assets go unnoticed. */
  async delete(providerAssetId: string): Promise<void> {
    const outcome = (await cloudinary.uploader.destroy(providerAssetId)) as { result?: string };

    if (outcome.result === 'not found') {
      throw new StorageAssetNotFoundError(`Cloudinary asset "${providerAssetId}" does not exist.`);
    }

    if (outcome.result !== 'ok') {
      throw new Error(
        `Cloudinary refused to delete "${providerAssetId}": ${outcome.result ?? 'unknown result'}`
      );
    }
  }
}
