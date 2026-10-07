import { Injectable, Logger } from '@nestjs/common';

import { randomUUID } from 'crypto';

import { StorageProvider } from './storage.provider';

import type {
  CreateUploadAuthorizationInput,
  UploadAuthorization,
  VerifyUploadResult,
} from '../types/storage-provider.type';

// Inlined data URI, not a placeholder service: this provider exists so uploads work with zero external dependencies.
const PLACEHOLDER_AVATAR_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
    '<rect width="256" height="256" fill="#CBD5E1"/>' +
    '<circle cx="128" cy="96" r="48" fill="#94A3B8"/>' +
    '<rect x="48" y="160" width="160" height="96" rx="48" fill="#94A3B8"/>' +
    '</svg>'
).toString('base64')}`;

/**
 * Unlike `NoopEmailProvider`, not forced outside production: the feature must be usable before real
 * Cloudinary credentials exist, in any environment. `verifyUpload` cannot genuinely verify anything,
 * so it returns the same canned metadata for any id.
 */
@Injectable()
export class NoopStorageProvider extends StorageProvider {
  readonly type = 'noop' as const;
  private readonly logger = new Logger(NoopStorageProvider.name);

  createUploadAuthorization(input: CreateUploadAuthorizationInput): Promise<UploadAuthorization> {
    const providerAssetId = `noop-${randomUUID()}`;
    this.logger.log(
      `[dev] Image upload authorization requested for folder "${input.folder}" — no real ` +
        `provider configured. Set STORAGE_PROVIDER=cloudinary (plus CLOUDINARY_*) to upload for real.`
    );

    // Empty `uploadUrl` tells the client to skip the upload leg.
    return Promise.resolve({ provider: 'noop', uploadUrl: '', formFields: {}, providerAssetId });
  }

  verifyUpload(providerAssetId: string): Promise<VerifyUploadResult> {
    this.logger.log(`[dev] "Verifying" ${providerAssetId} — returning the placeholder avatar.`);
    return Promise.resolve({
      ok: true,
      upload: {
        url: PLACEHOLDER_AVATAR_DATA_URI,
        mimeType: 'image/svg+xml',
        sizeBytes: PLACEHOLDER_AVATAR_DATA_URI.length,
      },
    });
  }

  delete(providerAssetId: string): Promise<void> {
    this.logger.log(`[dev] Image delete skipped — would have deleted asset "${providerAssetId}".`);
    return Promise.resolve();
  }
}
