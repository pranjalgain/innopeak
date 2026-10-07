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
   * Points the avatar row at `asset` (creating it if needed) and returns what it held before so
   * the caller can clean it up.
   *
   * Runs under a per-owner advisory lock because without it concurrent first uploads both insert
   * (the loser hits the unique index as a raw 23505 and orphans its asset), and concurrent
   * replacements both report the same previous asset. Keyed on owner id, so only one owner's own
   * confirms serialize.
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

  /** GDPR anonymization: no successor asset. Returns what was deleted for storage cleanup, or null when there was none (the common case). */
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
