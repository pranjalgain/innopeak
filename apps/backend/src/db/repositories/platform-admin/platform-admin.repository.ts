import { PlatformAdminInvitePurpose } from '@auth/enums/platform-admin-invite-purpose.enum';
import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import type { Locale } from '@common/i18n/locale';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';

import type {
  AcceptInviteOutcome,
  PlatformAdminAlertRecipient,
  PlatformAdminLoginRow,
  PlatformAdminProfileRow,
  RevokeInviteOutcome,
  SetAdminStatusGuardInput,
  SetAdminStatusOutcome,
} from './types/platform-admin.type';

const PROFILE_COLUMNS = {
  id: schema.platformAdmins.id,
  email: schema.platformAdmins.email,
  passwordHash: schema.platformAdmins.passwordHash,
  locale: schema.platformAdmins.locale,
} as const;

/**
 * A platform admin's own identity and the roster of invited admins; distinct from
 * `AdminUsersRepository`/`AdminBusinessesRepository`, which read tenant-scoped data.
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
   * `passwordHash` rides along so the caller can tell an `invited` admin (no password yet) from one
   * that can authenticate, without a second query.
   */
  async findForLogin(email: string): Promise<PlatformAdminLoginRow | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.platformAdmins.id,
        email: schema.platformAdmins.email,
        passwordHash: schema.platformAdmins.passwordHash,
        status: schema.platformAdmins.status,
        locale: schema.platformAdmins.locale,
      })
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.email, email))
      .limit(1);

    return (rows[0] as PlatformAdminLoginRow | undefined) ?? null;
  }

  /** Active admins only: an invited one has not accepted yet, a disabled one must not be mailed. */
  async findActiveAlertRecipients(): Promise<PlatformAdminAlertRecipient[]> {
    return this.dbService.db
      .select({ email: schema.platformAdmins.email, locale: schema.platformAdmins.locale })
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.status, PlatformAdminStatus.ACTIVE));
  }

  /**
   * `null` when no such row exists. `JwtStrategy` re-checks the principal with this on every request:
   * the JWT carries no status, so a disabled or removed admin's token would otherwise stay valid
   * for its full 15-minute life.
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
   * The seeded root: `invited_by_platform_admin_id IS NULL`, which
   * `idx_platform_admins_single_root` guarantees at most one row satisfies. `false` for a
   * nonexistent id; callers distinguish not-found via `findStatusById` first.
   */
  async isRootAdmin(id: string): Promise<boolean> {
    const rows = await this.dbService.db
      .select({ invitedByPlatformAdminId: schema.platformAdmins.invitedByPlatformAdminId })
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.id, id))
      .limit(1);

    return rows[0]?.invitedByPlatformAdminId === null;
  }

  /**
   * Atomically refuses a `disabled` write that would leave zero `active` admins. Read-then-write is
   * not enough: disabling two different admins touches different rows, so row locks never conflict
   * and both could read "2 active" and proceed. The advisory lock serializes every status change so
   * the second count reflects the first's write.
   */
  async setStatusGuardingLastActive(
    input: SetAdminStatusGuardInput
  ): Promise<SetAdminStatusOutcome> {
    const { id, status } = input;
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
   * a live claim on an email from a lapsed one; otherwise an expired invite answers 409 forever.
   * `expiresAt` is null for the seeded root (no invite row).
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

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.dbService.db
      .update(schema.platformAdmins)
      .set({ passwordHash, updatedAt: sql`now()` })
      .where(eq(schema.platformAdmins.id, id));
  }

  /**
   * Platform-admin counterpart to `AuthRepository.updateLocale`; no session to revoke, since a
   * locale change is not a security boundary.
   */
  async updateLocale(id: string, locale: Locale): Promise<void> {
    await this.dbService.db
      .update(schema.platformAdmins)
      .set({ locale, updatedAt: sql`now()` })
      .where(eq(schema.platformAdmins.id, id));
  }

  /**
   * Every admin including the seeded root, left-joined to its `invite`-purpose row; the root has
   * none, so `invitedAt`/`expiresAt` come back null (the DB service falls back to `createdAt`).
   */
  async findAllWithInvites(): Promise<
    {
      id: string;
      email: string;
      status: PlatformAdminStatus;
      createdAt: string;
      inviteCreatedAt: string | null;
      inviteExpiresAt: string | null;
      invitedByPlatformAdminId: string | null;
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
        invitedByPlatformAdminId: schema.platformAdmins.invitedByPlatformAdminId,
      })
      .from(schema.platformAdmins)
      // `purpose = 'invite'` lives in the JOIN condition: in a WHERE it would act as an INNER JOIN
      // and drop the seeded root (no invite row).
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
      invitedByPlatformAdminId: string | null;
    }[];
  }

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
      throw new Error(MESSAGES.ADMIN.FAILED_TO_CREATE_INVITED_PLATFORM_ADMIN);
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

  /**
   * Upsert on (owner, purpose) like `AuthRepository.putSetPasswordOtp`, via
   * `idx_platform_admin_invites_platform_admin_id_purpose`: a resend reissues the one live row. The
   * step-up proof `setPassword` requires before turning a 15-minute access token into a permanent
   * credential on a Google-only admin.
   */
  async putSetPasswordOtp(
    tx: DrizzleTransaction,
    input: { platformAdminId: string; tokenHash: string; expiresAt: string }
  ): Promise<void> {
    await tx
      .insert(schema.platformAdminInvites)
      .values({
        platformAdminId: input.platformAdminId,
        tokenHash: input.tokenHash,
        purpose: PlatformAdminInvitePurpose.SET_PASSWORD,
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: [schema.platformAdminInvites.platformAdminId, schema.platformAdminInvites.purpose],
        set: {
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          usedAt: null,
          updatedAt: sql`now()`,
        },
      });
  }

  /**
   * `consumeVerifyEmailToken`'s CAS shape, scoped to the `set_password` row `putSetPasswordOtp`
   * writes.
   */
  async consumeSetPasswordOtp(
    tx: DrizzleTransaction,
    input: { platformAdminId: string; tokenHash: string }
  ): Promise<boolean> {
    const rows = await tx
      .update(schema.platformAdminInvites)
      .set({ usedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.platformAdminInvites.platformAdminId, input.platformAdminId),
          eq(schema.platformAdminInvites.tokenHash, input.tokenHash),
          eq(schema.platformAdminInvites.purpose, PlatformAdminInvitePurpose.SET_PASSWORD),
          isNull(schema.platformAdminInvites.usedAt),
          gt(schema.platformAdminInvites.expiresAt, sql`now()`)
        )
      )
      .returning({ id: schema.platformAdminInvites.id });

    return rows.length > 0;
  }

  /**
   * Active admins with no `password_hash`, i.e. Google is their only way in. Backs
   * `updatePlatformSettings`' lockout guard: switching off `socialLoginEnabled` would strand them.
   * `invited` (no identity yet) and `disabled` (cannot sign in anyway) are excluded.
   */
  async countActiveGoogleOnlyAdmins(): Promise<number> {
    const rows = await this.dbService.db
      .select({ value: sql<number>`count(distinct ${schema.platformAdmins.id})::int` })
      .from(schema.platformAdmins)
      .innerJoin(
        schema.platformAdminIdentities,
        and(
          eq(schema.platformAdminIdentities.platformAdminId, schema.platformAdmins.id),
          eq(schema.platformAdminIdentities.provider, UserIdentityProvider.GOOGLE)
        )
      )
      .where(
        and(
          eq(schema.platformAdmins.status, PlatformAdminStatus.ACTIVE),
          isNull(schema.platformAdmins.passwordHash)
        )
      );

    return rows[0]?.value ?? 0;
  }

  /**
   * Resolves a Google `sub` to the admin that linked it at invite acceptance. Needed because such
   * an admin has no `password_hash` and platform admins have no refresh token, so the session would
   * otherwise end 15 minutes after acceptance. Keyed on `(provider, provider_user_id)`, not email:
   * a Workspace address can be reassigned, a `sub` never is.
   */
  async findByGoogleIdentity(providerUserId: string): Promise<{
    id: string;
    email: string;
    status: PlatformAdminStatus;
    locale: Locale | null;
  } | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.platformAdmins.id,
        email: schema.platformAdmins.email,
        status: schema.platformAdmins.status,
        locale: schema.platformAdmins.locale,
      })
      .from(schema.platformAdminIdentities)
      .innerJoin(
        schema.platformAdmins,
        eq(schema.platformAdmins.id, schema.platformAdminIdentities.platformAdminId)
      )
      .where(
        and(
          eq(schema.platformAdminIdentities.provider, UserIdentityProvider.GOOGLE),
          eq(schema.platformAdminIdentities.providerUserId, providerUserId)
        )
      )
      .limit(1);

    return (
      (rows[0] as
        | { id: string; email: string; status: PlatformAdminStatus; locale: Locale | null }
        | undefined) ?? null
    );
  }

  /**
   * Read-only preview so both routes fail fast on a dead link. Deliberately does not join
   * `platform_admins.status`: the invite row's `used_at`/`expires_at` are the only source of truth
   * for "still redeemable", and both accept methods flip them in one transaction.
   */
  async findInviteEmailByTokenHash(tokenHash: string): Promise<{ email: string } | null> {
    const rows = await this.dbService.db
      .select({ email: schema.platformAdmins.email })
      .from(schema.platformAdminInvites)
      .innerJoin(
        schema.platformAdmins,
        eq(schema.platformAdmins.id, schema.platformAdminInvites.platformAdminId)
      )
      .where(
        and(
          eq(schema.platformAdminInvites.tokenHash, tokenHash),
          eq(schema.platformAdminInvites.purpose, PlatformAdminInvitePurpose.INVITE),
          isNull(schema.platformAdminInvites.usedAt),
          sql`${schema.platformAdminInvites.expiresAt} > now()`
        )
      )
      .limit(1);

    return (rows[0] as { email: string } | undefined) ?? null;
  }

  /**
   * Shares its first steps (`lockLiveInvite`, consuming the invite) with
   * `acceptInviteWithGoogleIdentity`; only the `platform_admins` write differs.
   */
  async acceptInviteWithPassword(input: {
    tokenHash: string;
    passwordHash: string;
  }): Promise<AcceptInviteOutcome> {
    return this.dbService.db.transaction(async tx => {
      const invite = await this.lockLiveInvite(tx, input.tokenHash);
      if (!invite) {
        return { outcome: 'invalid' };
      }

      const activated = await tx
        .update(schema.platformAdmins)
        .set({
          passwordHash: input.passwordHash,
          status: PlatformAdminStatus.ACTIVE,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(schema.platformAdmins.id, invite.platformAdminId),
            eq(schema.platformAdmins.status, PlatformAdminStatus.INVITED)
          )
        )
        .returning({ id: schema.platformAdmins.id, email: schema.platformAdmins.email });

      const admin = activated[0];
      if (!admin) {
        // Raced with something else accepting/removing the same admin between the lock above and
        // this write.
        return { outcome: 'invalid' };
      }

      await this.consumeInvite(tx, invite.id);
      // Always null: a just-accepted invite has no prior session to have set a preference from.
      return { outcome: 'accepted', id: admin.id, email: admin.email, locale: null };
    });
  }

  /**
   * `AuthService.completeAdminInviteGoogle` has already confirmed the Google email matches the
   * invited address; this does not re-check it (`platform_admin_identities` has no email column).
   */
  async acceptInviteWithGoogleIdentity(input: {
    tokenHash: string;
    providerUserId: string;
  }): Promise<AcceptInviteOutcome> {
    return this.dbService.db.transaction(async tx => {
      const invite = await this.lockLiveInvite(tx, input.tokenHash);
      if (!invite) {
        return { outcome: 'invalid' };
      }

      const activated = await tx
        .update(schema.platformAdmins)
        .set({ status: PlatformAdminStatus.ACTIVE, updatedAt: sql`now()` })
        .where(
          and(
            eq(schema.platformAdmins.id, invite.platformAdminId),
            eq(schema.platformAdmins.status, PlatformAdminStatus.INVITED)
          )
        )
        .returning({ id: schema.platformAdmins.id, email: schema.platformAdmins.email });

      const admin = activated[0];
      if (!admin) {
        return { outcome: 'invalid' };
      }

      try {
        await tx.insert(schema.platformAdminIdentities).values({
          platformAdminId: admin.id,
          provider: UserIdentityProvider.GOOGLE,
          providerUserId: input.providerUserId,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Google account already linked to a different admin
          // (`idx_platform_admin_identities_provider_provider_user_id`); rolls back with the
          // transaction so the admin is not left half-activated.
          return { outcome: 'identity_already_linked' };
        }
        throw error;
      }

      await this.consumeInvite(tx, invite.id);
      // Always null: a just-accepted invite has no prior session to have set a preference from.
      return { outcome: 'accepted', id: admin.id, email: admin.email, locale: null };
    });
  }

  /**
   * Locks the live invite row inside the caller's transaction; the row lock, not just the later
   * `used_at` check on the `UPDATE`, closes the double-submit race.
   */
  private async lockLiveInvite(
    tx: DrizzleTransaction,
    tokenHash: string
  ): Promise<{ id: string; platformAdminId: string } | null> {
    const rows = await tx
      .select({
        id: schema.platformAdminInvites.id,
        platformAdminId: schema.platformAdminInvites.platformAdminId,
      })
      .from(schema.platformAdminInvites)
      .where(
        and(
          eq(schema.platformAdminInvites.tokenHash, tokenHash),
          eq(schema.platformAdminInvites.purpose, PlatformAdminInvitePurpose.INVITE),
          isNull(schema.platformAdminInvites.usedAt),
          sql`${schema.platformAdminInvites.expiresAt} > now()`
        )
      )
      .for('update')
      .limit(1);

    return (rows[0] as { id: string; platformAdminId: string } | undefined) ?? null;
  }

  private async consumeInvite(tx: DrizzleTransaction, inviteId: string): Promise<void> {
    await tx
      .update(schema.platformAdminInvites)
      .set({ usedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(schema.platformAdminInvites.id, inviteId));
  }

  /** The one place `DBService`'s raw connection is touched for a transaction boundary. */
  async transaction<T>(fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(fn);
  }

  /**
   * Hard-deletes the invited admin (cascading to its invite row), scoped to `status = 'invited'` so
   * an accepted or disabled admin is never deleted. Returns the email for the activity log, and
   * distinguishes `not_found` from `not_invited` so revoking an accepted admin does not answer a
   * misleading "Invite not found".
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

    // Nothing matched: no such id, or a row no longer `invited`. One extra read only on the failure
    // path.
    const existing = await this.dbService.db
      .select({ id: schema.platformAdmins.id })
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.id, id))
      .limit(1);

    return { outcome: existing.length > 0 ? 'not_invited' : 'not_found' };
  }

  /**
   * Drops a lapsed invite so the address can be invited again (a stale row otherwise claims it
   * forever). Scoped to `invited`: an accepted admin must never be removed by an invite-flow path.
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
