/** Mirrors the `media_exactly_one_owner` CHECK constraint: exactly one owner id. */
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

export interface ReplacedAsset {
  provider: string;
  providerAssetId: string;
}

export interface UpsertAvatarResult {
  row: MediaRow;
  /** The asset the row stopped pointing at, safe to delete; null for a first upload or a re-confirm of the same asset. */
  previousAsset: { provider: string; providerAssetId: string } | null;
}
