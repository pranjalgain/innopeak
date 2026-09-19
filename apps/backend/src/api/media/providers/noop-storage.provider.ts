import { Injectable, Logger } from '@nestjs/common';

import { randomUUID } from 'crypto';

import { StorageProvider } from './storage.provider';

import type {
  CreateUploadAuthorizationInput,
  UploadAuthorization,
  VerifyUploadResult,
} from '../types/storage-provider.type';

/**
 * A plain gray silhouette, inlined as a data URI rather than fetched from a placeholder service —
 * this provider exists specifically so the upload flow is exercisable with zero external
 * dependencies (no real credentials, no network reachability assumptions), and a placeholder that
 * itself required a network call to render would undercut that.
 */
const PLACEHOLDER_AVATAR_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
    '<rect width="256" height="256" fill="#CBD5E1"/>' +
    '<circle cx="128" cy="96" r="48" fill="#94A3B8"/>' +
    '<rect x="48" y="160" width="160" height="96" rx="48" fill="#94A3B8"/>' +
    '</svg>'
).toString('base64')}`;

/**
 * The default `StorageProvider` — see `MediaModule`'s factory for why, unlike `NoopEmailProvider`,
 * this one is not forced outside production: the whole point of this feature is to be usable
 * before real Cloudinary credentials exist, in whichever environment that happens to be, and a
 * hard non-production override would make that impossible to verify locally right up until the
 * moment real credentials arrive.
 *
 * There is no real provider behind this, so `verifyUpload` cannot genuinely verify anything — it
 * accepts any id `createUploadAuthorization` could plausibly have produced and returns the same
 * canned metadata every time, rather than pretending to check something that isn't there. The
 * client-side contract this depends on: seeing `provider: 'noop'` in the authorization response,
 * the client skips the real direct-upload step entirely and calls confirm with the id handed back
 * here — see `UploadAuthorization`'s own doc comment.
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

    // Empty `uploadUrl` is the signal to skip the upload leg entirely — see `UploadAuthorization`.
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
