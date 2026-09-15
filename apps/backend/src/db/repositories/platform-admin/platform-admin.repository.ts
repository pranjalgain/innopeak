import { PlatformAdminInvitePurpose } from '@auth/enums/platform-admin-invite-purpose.enum';
import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';

export interface PlatformAdminProfileRow {
  id: string;
  email: string;
  passwordHash: string | null;
  avatarUrl: string | null;
}

export interface PlatformAdminInviteRow {
  id: string;
  email: string;
  status: PlatformAdminStatus;
  /** Falls back to the admin's own `createdAt` for the seeded root admin, which has no invite row
   * at all — see `PlatformAdminDbService.listInvites`. */
  invitedAt: string;
  expiresAt: string | null;
}

/**
 * Each member carries a single literal discriminant rather than one member with a
 * `'not_found' | 'not_invited'` union: narrowing by `!== 'not_found'` only subtracts that literal
 * from such a member's property type, it never eliminates the member, so the `deleted` branch
 * stays unnarrowed and `email` is unreachable at every call site.
 */
export type RevokeInviteOutcome =
  | { outcome: 'deleted'; id: string; email: string }
  | { outcome: 'not_found' }
  | { outcome: 'not_invited' };

/** Same reasoning as `RevokeInviteOutcome` above — see `setStatusGuardingLastActive`. */
export type SetAdminStatusOutcome =
  | { outcome: 'last_active' }
  | { outcome: 'not_found' }
  | { outcome: 'updated'; id: string; email: string; status: PlatformAdminStatus };

const PROFILE_COLUMNS = {
  id: schema.platformAdmins.id,
  email: schema.platformAdmins.email,
  passwordHash: schema.platformAdmins.passwordHash,
  avatarUrl: schema.platformAdmins.avatarUrl,
} as const;

/**
 * `platform_admins`/`platform_admin_invites` — a platform admin's own identity and the roster of
 * admins invited to join. Distinct domain from `AdminUsersRepository`/`AdminBusinessesRepository`,
 * which read tenant-scoped data; this one owns the platform-admin identity table itself.
 */
@Injectable()
export class PlatformAdminRepository {
  constructor(private readonly dbService: DBService) {}

  async findById(id: string): Promise<PlatformAdminProfileRow | null> {
    const rows = await this.dbService.db
      .select(PROFILE_COLUMNS)
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.id, id))
      .limit(1);

    return (rows[0] as PlatformAdminProfileRow | undefined) ?? null;
  }

  /**
   * The live `status` of an admin by id — `null` when no such row exists (a deleted admin). Used by
   * `JwtStrategy` to re-check the principal on every request: a platform-admin access token is
   * otherwise honored for its full 15-minute life even after the admin is disabled or removed,
   * because the JWT itself carries no status. Kept to a single indexed-PK lookup.
   */
  async findStatusById(id: string): Promise<PlatformAdminStatus | null> {
    const rows = await this.dbService.db
      .select({ status: schema.platformAdmins.status })
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.id, id))
      .limit(1);

    return (rows[0]?.status as PlatformAdminStatus | undefined) ?? null;
  }

  /**
   * Sets an admin's status, atomically refusing a `disabled` write that would leave zero `active`
   * admins. A plain read-then-write ("count active, then UPDATE if > 1") is not enough on its own:
   * disabling admin A and disabling admin B touch two *different* rows, so ordinary row-level
   * locking never makes the two conflict, and two concurrent disables of two different admins can
   * each read "2 active" before either commits and both proceed — leaving zero, with no admin left
   * who can re-enable anyone. The transaction-scoped advisory lock below (mirrors
   * `ReviewSyncRepository.purgeExpiredReviewerPii`'s own) serializes every status change against
   * every other one, so the second transaction's count is guaranteed to already reflect the
   * first's write. Coarse, but disabling an admin is a rare, low-volume action.
   *
   * Scoped to flip only between `active` and `disabled` by the caller — this method itself does
   * not treat `invited` rows any differently, but the service never asks it to.
   */
  async setStatusGuardingLastActive(
    id: string,
    status: PlatformAdminStatus
  ): Promise<SetAdminStatusOutcome> {
    return this.dbService.db.transaction(async tx => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('platform_admins:status-guard'), 0)`
      );

      const current = await tx
        .select({ status: schema.platformAdmins.status })
        .from(schema.platformAdmins)
        .where(eq(schema.platformAdmins.id, id))
        .limit(1);
      const currentRow = current[0] as { status: PlatformAdminStatus } | undefined;
      if (!currentRow) {
        return { outcome: 'not_found' };
      }

      if (
        status === PlatformAdminStatus.DISABLED &&
        currentRow.status === PlatformAdminStatus.ACTIVE
      ) {
        const activeOthers = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(schema.platformAdmins)
          .where(
            and(
              eq(schema.platformAdmins.status, PlatformAdminStatus.ACTIVE),
              ne(schema.platformAdmins.id, id)
            )
          );
        if ((activeOthers[0]?.value ?? 0) < 1) {
          return { outcome: 'last_active' };
        }
      }

      const rows = await tx
        .update(schema.platformAdmins)
        .set({ status, updatedAt: sql`now()` })
        .where(eq(schema.platformAdmins.id, id))
        .returning({
          id: schema.platformAdmins.id,
          email: schema.platformAdmins.email,
          status: schema.platformAdmins.status,
        });

      const updated = rows[0] as
        { id: string; email: string; status: PlatformAdminStatus } | undefined;
      if (!updated) {
        return { outcome: 'not_found' };
      }
      return { outcome: 'updated', id: updated.id, email: updated.email, status: updated.status };
    });
  }

  /**
   * `status` and the invite's `expiresAt` ride along so `AdminSettingsService.sendInvite` can tell
   * a live claim on this email from a dead one: an `invited` row whose invite has lapsed used to
   * answer 409 forever, with no resend path and no expiry sweep, so a single expired invite burned
   * that address permanently. `expiresAt` is null for an admin with no invite row (the seeded
   * root), which reads correctly as "not an expired invite".
   */
  async findByEmail(
    email: string
  ): Promise<{ id: string; status: PlatformAdminStatus; inviteExpiresAt: string | null } | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.platformAdmins.id,
        status: schema.platformAdmins.status,
        inviteExpiresAt: schema.platformAdminInvites.expiresAt,
      })
      .from(schema.platformAdmins)
      .leftJoin(
        schema.platformAdminInvites,
        and(
          eq(schema.platformAdminInvites.platformAdminId, schema.platformAdmins.id),
          eq(schema.platformAdminInvites.purpose, PlatformAdminInvitePurpose.INVITE)
        )
      )
      .where(eq(schema.platformAdmins.email, email))
      .limit(1);

    return (
      (rows[0] as
        { id: string; status: PlatformAdminStatus; inviteExpiresAt: string | null } | undefined) ??
      null
    );
  }

  async updateAvatarUrl(id: string, avatarUrl: string): Promise<void> {
    await this.dbService.db
      .update(schema.platformAdmins)
      .set({ avatarUrl, updatedAt: sql`now()` })
      .where(eq(schema.platformAdmins.id, id));
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.dbService.db
      .update(schema.platformAdmins)
      .set({ passwordHash, updatedAt: sql`now()` })
      .where(eq(schema.platformAdmins.id, id));
  }

  /**
   * Every platform admin — the seeded root included — each left-joined to its own `invite`-purpose
   * `platform_admin_invites` row for `invitedAt`/`expiresAt`. The root has no such row (seeded
   * directly, never invited), so those two columns come back `null` for it; the DB service maps
   * that to a `createdAt` fallback.
   */
  async findAllWithInvites(): Promise<
    {
      id: string;
      email: string;
      status: PlatformAdminStatus;
      createdAt: string;
      inviteCreatedAt: string | null;
      inviteExpiresAt: string | null;
    }[]
  > {
    const rows = await this.dbService.db
      .select({
        id: schema.platformAdmins.id,
        email: schema.platformAdmins.email,
        status: schema.platformAdmins.status,
        createdAt: schema.platformAdmins.createdAt,
        inviteCreatedAt: schema.platformAdminInvites.createdAt,
        inviteExpiresAt: schema.platformAdminInvites.expiresAt,
      })
      .from(schema.platformAdmins)
      // `purpose = 'invite'` lives in the JOIN condition, not a WHERE clause — a WHERE here would
      // turn this back into an INNER JOIN in effect, dropping the seeded root admin (which has no
      // invite row at all) from the result entirely.
      .leftJoin(
        schema.platformAdminInvites,
        and(
          eq(schema.platformAdminInvites.platformAdminId, schema.platformAdmins.id),
          eq(schema.platformAdminInvites.purpose, PlatformAdminInvitePurpose.INVITE)
        )
      )
      .orderBy(desc(schema.platformAdmins.createdAt));

    return rows as {
      id: string;
      email: string;
      status: PlatformAdminStatus;
      createdAt: string;
      inviteCreatedAt: string | null;
      inviteExpiresAt: string | null;
    }[];
  }

  /** Creates the invited admin's own row — `status: invited`, no password, attributed to whoever sent the invite. */
  async insertInvitedAdmin(
    tx: DrizzleTransaction,
    input: { email: string; invitedByPlatformAdminId: string }
  ): Promise<{ id: string }> {
    const rows = await tx
      .insert(schema.platformAdmins)
      .values({
        email: input.email,
        status: PlatformAdminStatus.INVITED,
        invitedByPlatformAdminId: input.invitedByPlatformAdminId,
      })
      .returning({ id: schema.platformAdmins.id });
    const row = rows[0];

    if (!row) {
      throw new Error('Failed to create invited platform admin');
    }

    return row;
  }

  async insertInviteToken(
    tx: DrizzleTransaction,
    input: { platformAdminId: string; tokenHash: string; expiresAt: string }
  ): Promise<void> {
    await tx.insert(schema.platformAdminInvites).values({
      platformAdminId: input.platformAdminId,
      tokenHash: input.tokenHash,
      purpose: PlatformAdminInvitePurpose.INVITE,
      expiresAt: input.expiresAt,
    });
  }

  /** The one place `DBService`'s raw connection is touched for a transaction boundary — mirrors `AuthRepository.transaction`. */
  async transaction<T>(fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(fn);
  }

  /**
   * Deletes the invited admin's own row outright (cascading to its `platform_admin_invites` row)
   * — not a soft-disable, since the admin never accepted and never had a real account to begin
   * with. Scoped to `status = 'invited'` so this can never delete an admin who has since accepted
   * or an already-disabled one; returns whether a row actually matched.
   */
  /**
   * Returns the deleted row's own email (the activity log needs it — the row is gone by the time
   * anything could look it back up).
   *
   * The two failure modes are distinguished rather than both reported as `null`: folding them
   * together meant revoking an admin who had already accepted answered "Invite not found", which
   * is actively misleading (the invite is right there in the roster) and left
   * `MESSAGES.ADMIN.INVITE_NOT_REVOCABLE` defined in both locales but unreachable from any code
   * path.
   */
  async deleteInvitedAdmin(id: string): Promise<RevokeInviteOutcome> {
    const rows = await this.dbService.db
      .delete(schema.platformAdmins)
      .where(
        and(
          eq(schema.platformAdmins.id, id),
          eq(schema.platformAdmins.status, PlatformAdminStatus.INVITED)
        )
      )
      .returning({ id: schema.platformAdmins.id, email: schema.platformAdmins.email });

    const deleted = rows[0];
    if (deleted) {
      return { outcome: 'deleted', id: deleted.id, email: deleted.email };
    }

    // Nothing matched: either no such id at all, or an id whose row is no longer `invited`. One
    // extra read only on the failure path, so the happy path stays a single statement.
    const existing = await this.dbService.db
      .select({ id: schema.platformAdmins.id })
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.id, id))
      .limit(1);

    return { outcome: existing.length > 0 ? 'not_invited' : 'not_found' };
  }

  /**
   * Drops a lapsed invite so the same address can be invited again — see `findByEmail` for why a
   * stale row otherwise claims that email forever. Scoped to `invited` for the same reason
   * `deleteInvitedAdmin` is: an accepted admin must never be removed by an invite-flow path.
   */
  async deleteExpiredInvite(id: string): Promise<void> {
    await this.dbService.db
      .delete(schema.platformAdmins)
      .where(
        and(
          eq(schema.platformAdmins.id, id),
          eq(schema.platformAdmins.status, PlatformAdminStatus.INVITED)
        )
      );
  }
}
