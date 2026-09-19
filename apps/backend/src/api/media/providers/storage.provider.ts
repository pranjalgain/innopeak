import type {
  CreateUploadAuthorizationInput,
  StorageProviderType,
  UploadAuthorization,
  VerifyUploadResult,
} from '../types/storage-provider.type';

export abstract class StorageProvider {
  /** `MediaService` persists this on every confirmed upload's `media.provider` column — the
   *  record of *which* provider actually holds a given asset, independent of whichever provider
   *  happens to be active now (see that column's own migration comment). */
  abstract readonly type: StorageProviderType;

  /** Mints whatever the client needs to upload directly to this provider — see
   *  `UploadAuthorization`'s own doc comment for why this return shape is deliberately
   *  provider-agnostic — a URL plus opaque form fields, not named provider parameters. */
  abstract createUploadAuthorization(
    input: CreateUploadAuthorizationInput
  ): Promise<UploadAuthorization>;

  /**
   * Independently confirms `providerAssetId` is a real asset this same provider issued, sitting
   * in `expectedFolder`, and returns its authoritative metadata — never the client's own claim
   * about what it uploaded. `MediaService.confirmAvatar` never persists anything this method
   * hasn't itself vouched for; `ok: false` means the client's confirm call is rejected outright —
   * see `VerifyUploadResult`'s own doc comment for why its `reason` distinguishes exactly one
   * case worth surfacing to the client.
   */
  abstract verifyUpload(
    providerAssetId: string,
    expectedFolder: string
  ): Promise<VerifyUploadResult>;

  /**
   * Deletes a previously-confirmed asset by the id `verifyUpload` accepted for it. Callers treat
   * this as best-effort (see `MediaService.confirmAvatar`) — a failure here means an orphaned
   * asset sitting in storage, not a broken avatar, so it must never be allowed to fail the request
   * that triggered it.
   */
  abstract delete(providerAssetId: string): Promise<void>;
}
