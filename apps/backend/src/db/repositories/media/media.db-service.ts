import { Injectable } from '@nestjs/common';

import { MediaRepository } from './media.repository';
import type {
  MediaOwner,
  ReplacedAsset,
  UploadedAssetInput,
  UpsertAvatarResult,
} from './types/media.type';

/**
 * `media` — composes `MediaRepository`'s reads/writes into the one operation `MediaService`
 * actually needs: "this owner's avatar is now this asset," whether or not one already existed.
 * Deliberately does not call the storage provider itself (deleting the previous asset, say) — that
 * is an external side effect and belongs in the Service layer; this stays DB-only, per this
 * codebase's own DB-Service convention.
 */
@Injectable()
export class MediaDbService {
  constructor(private readonly mediaRepository: MediaRepository) {}

  async findAvatarUrl(owner: MediaOwner): Promise<string | null> {
    const row = await this.mediaRepository.findAvatar(owner);
    return row?.url ?? null;
  }

  /** Non-destructive read of this owner's current avatar asset, if any — see
   *  `MediaService.deleteAvatarIfPresent` for why the storage delete must be attempted before the
   *  DB row is touched, which rules out reusing the destructive `deleteAvatar` for that check. */
  async findAvatarAsset(owner: MediaOwner): Promise<ReplacedAsset | null> {
    const row = await this.mediaRepository.findAvatar(owner);
    return row ? { provider: row.provider, providerAssetId: row.providerAssetId } : null;
  }

  /**
   * "This owner's avatar is now this asset," whether or not one already existed — the atomicity
   * (and the races it closes) lives in `MediaRepository.upsertAvatar`; what this adds is deciding
   * whether anything was actually *orphaned* by the write.
   *
   * Confirming the id the row already holds (a double-clicked button, a client retry, a refresh
   * that re-submits) displaces nothing — the row points exactly where it did. Reporting that as
   * `previousAsset` anyway made the caller delete the very asset it had just saved, answering 200
   * while leaving the avatar a permanent 404.
   */
  async upsertAvatar(owner: MediaOwner, asset: UploadedAssetInput): Promise<UpsertAvatarResult> {
    const { row, replaced } = await this.mediaRepository.upsertAvatar(owner, asset);

    const orphaned =
      replaced !== null &&
      (replaced.providerAssetId !== asset.providerAssetId || replaced.provider !== asset.provider);

    return { row, previousAsset: orphaned ? replaced : null };
  }

  /** See `MediaRepository.deleteAvatar`. */
  async deleteAvatar(owner: MediaOwner): Promise<ReplacedAsset | null> {
    return this.mediaRepository.deleteAvatar(owner);
  }
}
