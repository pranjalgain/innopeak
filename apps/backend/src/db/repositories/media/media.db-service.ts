import { Injectable } from '@nestjs/common';

import { MediaRepository } from './media.repository';
import type {
  MediaOwner,
  ReplacedAsset,
  UploadedAssetInput,
  UpsertAvatarResult,
} from './types/media.type';

@Injectable()
export class MediaDbService {
  constructor(private readonly mediaRepository: MediaRepository) {}

  async findAvatarUrl(owner: MediaOwner): Promise<string | null> {
    const row = await this.mediaRepository.findAvatar(owner);
    return row?.url ?? null;
  }

  /** Non-destructive: the storage delete must happen before the DB row is touched, so the destructive `deleteAvatar` can't serve this check. */
  async findAvatarAsset(owner: MediaOwner): Promise<ReplacedAsset | null> {
    const row = await this.mediaRepository.findAvatar(owner);
    return row ? { provider: row.provider, providerAssetId: row.providerAssetId } : null;
  }

  /**
   * Decides whether the write orphaned anything. Re-confirming the id the row already holds
   * (double click, retry) displaces nothing; reporting it as `previousAsset` would make the caller
   * delete the asset it just saved.
   */
  async upsertAvatar(owner: MediaOwner, asset: UploadedAssetInput): Promise<UpsertAvatarResult> {
    const { row, replaced } = await this.mediaRepository.upsertAvatar(owner, asset);

    const orphaned =
      replaced !== null &&
      (replaced.providerAssetId !== asset.providerAssetId || replaced.provider !== asset.provider);

    return { row, previousAsset: orphaned ? replaced : null };
  }

  async deleteAvatar(owner: MediaOwner): Promise<ReplacedAsset | null> {
    return this.mediaRepository.deleteAvatar(owner);
  }
}
