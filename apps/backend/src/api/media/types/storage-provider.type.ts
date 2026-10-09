export type StorageProviderType = 'cloudinary';

export interface CreateUploadAuthorizationInput {
  /** Owner-scoped. Signed into the authorization, and `verifyUpload` re-derives it from the authenticated owner, which stops one owner confirming another's asset. */
  folder: string;
}

/**
 * Provider-agnostic: the client POSTs `file` plus every `formFields` entry verbatim to `uploadUrl`.
 * Provider-specific keys would be a silent client/server contract that fails only at runtime.
 */
export interface UploadAuthorization {
  provider: StorageProviderType;
  /** Absolute URL to POST the file to. */
  uploadUrl: string;
  /** Sent verbatim alongside `file`; opaque to the client. Includes the provider's own signature
   *  and every parameter that signature covers, so dropping or editing one invalidates it. */
  formFields: Record<string, string>;
}

export interface VerifiedUpload {
  url: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Thrown by `delete` when the asset is already gone. The absence is the goal state, so callers may
 * proceed to remove the `media` row; otherwise a retry after a crash between storage delete and
 * row delete would fail forever.
 */
export class StorageAssetNotFoundError extends Error {}

export type VerifyUploadResult =
  | {
      ok: false;
      /**
       * `unsupportedFormat`/`tooLarge` are safe to name specifically: reaching them requires a real
       * asset the caller just uploaded. `notFound` collapses "missing" and "wrong folder" so
       * someone probing the confirm endpoint with made-up ids learns nothing.
       */
      reason: 'notFound' | 'tooLarge' | 'unsupportedFormat';
    }
  | { ok: true; upload: VerifiedUpload };
