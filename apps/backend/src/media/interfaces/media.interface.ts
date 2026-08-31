// ─── Storage Provider Types ──────────────────────────────────────────────────

export enum StorageProviderType {
  S3 = 's3',
  CLOUDINARY = 'cloudinary',
  LOCAL = 'local',
}

// ─── Media File ──────────────────────────────────────────────────────────────

export interface MediaFile {
  id: string;
  userId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: string;
  storageProvider: string;
  storageKey: string;
  url: string | null;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ─── Upload Result ───────────────────────────────────────────────────────────

export interface UploadResult {
  storageKey: string;
  url: string;
  thumbnailUrl: string | null;
}
