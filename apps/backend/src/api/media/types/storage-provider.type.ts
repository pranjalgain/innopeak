/** Selected by the `STORAGE_PROVIDER` env var — a field that already existed on `EnvConfig`,
 *  vestigial scaffolding from the original boilerplate `media` module (deleted per the root
 *  CLAUDE.md's "Existing Modules" note) that this feature is the first to actually read. */
export type StorageProviderType = 'cloudinary' | 'noop';

export interface CreateUploadAuthorizationInput {
  /** The owner-scoped, provider-side folder this asset must land in (see `avatarFolderFor`). Not
   *  cosmetic: it is signed into the authorization, so the upload cannot land anywhere else, and
   *  `verifyUpload` re-derives it from the *authenticated* owner to check the confirmed asset
   *  really is that owner's. That pairing is what stops one owner confirming another's asset. */
  folder: string;
}

/**
 * Everything the client needs to perform the direct upload, shaped so the client never has to know
 * *which* provider it is talking to: POST `file` plus every `formFields` entry verbatim to
 * `uploadUrl`. Deliberately not a bag of provider-specific keys the client picks through — that
 * made every field name a silent contract between two codebases, where renaming one server-side
 * left the client compiling happily and failing at runtime.
 *
 * `noop` is the one provider with nothing to upload to: it sends an empty `uploadUrl`, so the
 * client skips the upload entirely and confirms with `providerAssetId` instead.
 */
export interface UploadAuthorization {
  provider: StorageProviderType;
  /** Absolute URL to POST the file to — empty for `noop`, which has no real endpoint. */
  uploadUrl: string;
  /** Sent verbatim alongside `file`; opaque to the client. Includes the provider's own signature
   *  and every parameter that signature covers, so dropping or editing one invalidates it. */
  formFields: Record<string, string>;
  /** `noop` only — the id to confirm with, since there is no upload response to learn one from. */
  providerAssetId?: string;
}

export interface VerifiedUpload {
  url: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * `verifyUpload`'s result, split into two failure reasons rather than a bare `null` — see
 * `MediaService.confirmAvatar`'s own comment for why only one of them is safe to surface to the
 * client as anything more specific than "could not verify this upload."
 */
/**
 * `StorageProvider.delete` throws this specifically when the asset is already gone from storage —
 * distinct from any other delete failure (rate limit, auth error, network blip). `MediaService.
 * deleteAvatarIfPresent` treats this one case differently: the asset's absence IS the goal state a
 * delete is trying to reach, so it's safe to proceed to removing the `media` row even though the
 * provider call itself "failed" — without this distinction, a retry of a DB-row delete that
 * crashed right after a successful storage delete can never make progress, since the asset it
 * reads is already gone and every retry's storage-delete call fails the same way forever.
 */
export class StorageAssetNotFoundError extends Error {}

export type VerifyUploadResult =
  | {
      ok: false;
      /**
       * `unsupportedFormat`: the asset is real, in the right folder, but its format isn't one this
       * app persists avatars as — a legitimate, actionable client error (wrong file picked), safe
       * to name specifically since reaching this branch already requires a real asset the caller
       * itself just uploaded through its own signed authorization.
       *
       * `tooLarge`: a real, in-folder asset that exceeds the size cap — actionable for the same
       * reason as `unsupportedFormat`, and safe to name for the same reason.
       *
       * `notFound`: the asset doesn't exist, or isn't in the expected folder — collapsed into one
       * generic reason since either could equally be a client bug or someone probing the confirm
       * endpoint with a made-up id, and telling those apart would help the latter.
       */
      reason: 'notFound' | 'tooLarge' | 'unsupportedFormat';
    }
  | { ok: true; upload: VerifiedUpload };
