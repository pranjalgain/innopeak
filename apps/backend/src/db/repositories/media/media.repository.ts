import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { and, eq, sql } from 'drizzle-orm';

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
        throw new Error('Failed to persist avatar');
      }

      return {
        row,
        replaced: existing
          ? { provider: existing.provider, providerAssetId: existing.providerAssetId }
          : null,
      };
    });
  }
}
