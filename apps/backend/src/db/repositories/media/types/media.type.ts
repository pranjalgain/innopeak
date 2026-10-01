/** Exactly one of `userId`/`platformAdminId` — mirrors the table's own `media_exactly_one_owner`
 *  CHECK constraint at the type level, so a caller can't accidentally pass both or neither. */
export type MediaOwner =
  { userId: string; platformAdminId?: never } | { userId?: never; platformAdminId: string };

export interface MediaRow {
  id: string;
  kind: 'avatar';
  provider: string;
  providerAssetId: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadedAssetInput {
  provider: string;
  providerAssetId: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

/** Just enough of a displaced row to reach the asset again at the provider it was stored in. */
export interface ReplacedAsset {
  provider: string;
  providerAssetId: string;
}

export interface UpsertAvatarResult {
  row: MediaRow;
  /** The asset this row has *stopped* pointing at, which the caller is then free to delete —
   *  `null` whenever nothing was orphaned, i.e. a first-ever upload, or a re-confirm that landed
   *  on the asset the row already held. See `upsertAvatar` for why that second case matters. */
  previousAsset: { provider: string; providerAssetId: string } | null;
}
