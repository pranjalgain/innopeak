import { MESSAGES } from '@common/constants/messages.constants';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { and, eq, sql } from 'drizzle-orm';

import type { MediaOwner, MediaRow, ReplacedAsset, UploadedAssetInput } from './types/media.type';

const MEDIA_COLUMNS = {
  id: schema.media.id,
  kind: schema.media.kind,
  provider: schema.media.provider,
  providerAssetId: schema.media.providerAssetId,
  url: schema.media.url,
  mimeType: schema.media.mimeType,
  sizeBytes: schema.media.sizeBytes,
} as const;

function ownerCondition(owner: MediaOwner): SQL {
  return owner.userId !== undefined
    ? eq(schema.media.userId, owner.userId)
    : eq(schema.media.platformAdminId, owner.platformAdminId);
}

/**
 * `media` — one row per uploaded asset (avatars today), owned by exactly one of `users`/
 * `platform_admins`. The unique partial indexes on `(owner, kind)` mean "this owner's current
 * avatar" is always at most one row, so every method here reads/writes that single row directly
 * rather than a list plus a "which one is current" filter.
 */
@Injectable()
export class MediaRepository {
  constructor(private readonly dbService: DBService) {}

  async findAvatar(owner: MediaOwner): Promise<MediaRow | null> {
    const rows = await this.dbService.db
      .select(MEDIA_COLUMNS)
      .from(schema.media)
      .where(and(ownerCondition(owner), eq(schema.media.kind, 'avatar')))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Point this owner's avatar row at `asset`, creating the row if there isn't one, and report
   * whichever asset the row held beforehand so the caller can clean it up.
   *
   * Read-and-write in one transaction behind a per-owner advisory lock (same shape as
   * `PlatformAdminRepository.setStatusGuardingLastActive`), because the read-then-write this
   * replaced had two live races:
   *  - two concurrent *first* uploads both saw no row, both inserted, and the loser hit the
   *    `(owner, kind)` partial unique index as a raw 23505 — a 500 plus an orphaned asset;
   *  - two concurrent *replacements* both read the same previous row and both reported it, so the
   *    old asset was deleted twice and whichever upload lost the write was orphaned forever.
   *
   * The lock is keyed on the owner id, so two different people uploading at the same time never
   * wait on each other — only the same owner's own concurrent confirms serialize.
   */
  async upsertAvatar(
    owner: MediaOwner,
    asset: UploadedAssetInput
  ): Promise<{ row: MediaRow; replaced: ReplacedAsset | null }> {
    const ownerId = owner.userId ?? owner.platformAdminId;

    return this.dbService.db.transaction(async tx => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('media:avatar'), hashtext(${ownerId}))`
      );

      const existingRows = await tx
        .select(MEDIA_COLUMNS)
        .from(schema.media)
        .where(and(ownerCondition(owner), eq(schema.media.kind, 'avatar')))
        .limit(1);
      const existing = existingRows[0] ?? null;

      const rows = existing
        ? await tx
            .update(schema.media)
            .set({ ...asset, updatedAt: sql`now()` })
            .where(eq(schema.media.id, existing.id))
            .returning(MEDIA_COLUMNS)
        : await tx
            .insert(schema.media)
            .values({
              kind: 'avatar',
              userId: owner.userId ?? null,
              platformAdminId: owner.platformAdminId ?? null,
              ...asset,
            })
            .returning(MEDIA_COLUMNS);

      const row = rows[0];
      if (!row) {
        throw new Error(MESSAGES.MEDIA.FAILED_TO_PERSIST_AVATAR);
      }

      return {
        row,
        replaced: existing
          ? { provider: existing.provider, providerAssetId: existing.providerAssetId }
          : null,
      };
    });
  }

  /** Deletes this owner's avatar row outright (GDPR anonymization — there is no successor asset to
   *  point at), returning what was deleted so the caller can clean up the storage side. `null` when
   *  there was no avatar to begin with, which is the common case, not an error. */
  async deleteAvatar(owner: MediaOwner): Promise<ReplacedAsset | null> {
    const rows = await this.dbService.db
      .delete(schema.media)
      .where(and(ownerCondition(owner), eq(schema.media.kind, 'avatar')))
      .returning(MEDIA_COLUMNS);

    const deleted = rows[0];
    return deleted
      ? { provider: deleted.provider, providerAssetId: deleted.providerAssetId }
      : null;
  }
}
