import type {
  CreateUploadAuthorizationInput,
  StorageProviderType,
  UploadAuthorization,
  VerifyUploadResult,
} from '../types/storage-provider.type';

export abstract class StorageProvider {
  /** Persisted on `media.provider`: records which provider holds an asset, independent of the currently active one. */
  abstract readonly type: StorageProviderType;

  /** False until the provider's credentials are set; the upload routes answer 503 rather than hand out an authorization that cannot work. */
  abstract isConfigured(): boolean;

  abstract createUploadAuthorization(
    input: CreateUploadAuthorizationInput
  ): Promise<UploadAuthorization>;

  /** Returns the provider's authoritative metadata, never the client's own claim; nothing unverified is persisted. */
  abstract verifyUpload(
    providerAssetId: string,
    expectedFolder: string
  ): Promise<VerifyUploadResult>;

  /** Callers treat this as best-effort: a failure only orphans an asset, so it must never fail the triggering request. */
  abstract delete(providerAssetId: string): Promise<void>;
}
