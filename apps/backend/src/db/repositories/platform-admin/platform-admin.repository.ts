import { PlatformAdminInvitePurpose } from '@auth/enums/platform-admin-invite-purpose.enum';
import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import type { Locale } from '@common/i18n/locale';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';

export interface PlatformAdminProfileRow {
  id: string;
  email: string;
  passwordHash: string | null;
  avatarUrl: string | null;
  locale: Locale | null;
}

export interface PlatformAdminLoginRow {
  id: string;
  email: string;
  /** Null for an `invited` admin who hasn't accepted their invite/set a password yet. */
  passwordHash: string | null;
  status: PlatformAdminStatus;
  locale: Locale | null;
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

/**
 * `invalid` covers every reason the invite couldn't be redeemed — never existed, already used,
 * expired, or lost a race between the read and the write below — collapsed into one outcome
 * deliberately: distinguishing them to the caller would tell a prober which guess was closest, the
 * same enumeration-avoidance reasoning as `MESSAGES.AUTH.INVALID_OR_EXPIRED_OTP`.
 *
 * `identity_already_linked` is `acceptInviteWithGoogleIdentity`-only and IS worth telling apart —
 * it's an actionable, non-enumerating answer ("this Google account is already someone else's"),
 * not a guess about the token.
 */
export type AcceptInviteOutcome =
  | { outcome: 'accepted'; id: string; email: string; locale: Locale | null }
  | { outcome: 'identity_already_linked' }
  | { outcome: 'invalid' };

export interface SetAdminStatusGuardInput {
  id: string;
  status: PlatformAdminStatus;
}

const PROFILE_COLUMNS = {
  id: schema.platformAdmins.id,
  email: schema.platformAdmins.email,
  passwordHash: schema.platformAdmins.passwordHash,
  avatarUrl: schema.platformAdmins.avatarUrl,
  locale: schema.platformAdmins.locale,
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
   * By email, for `PlatformAdminAuthService.login` — the platform-admin login now queries this
   * table directly rather than going through a shared tenant lookup, since `POST
   * /v1/admin/auth/login` is its own route with nothing left to disambiguate (see
   * `separate-admin-login-design.md`). `passwordHash` rides along so the caller can tell an
   * `invited` admin (no password yet) from one that can actually authenticate, without a second
   * query.
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

  /** Settings → Profile's language preference — the platform-admin counterpart to
   *  `AuthRepository.updateLocale`. No session to revoke, same reasoning as `updatePasswordHash`
   *  gives for why a locale change is not a security boundary. */
  async updateLocale(id: string, locale: Locale): Promise<void> {
    await this.dbService.db
      .update(schema.platformAdmins)
      .set({ locale, updatedAt: sql`now()` })
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

  /**
   * How many *active* admins could sign in by Google and nothing else — no `password_hash`, so no
   * other credential exists for them at all.
   *
   * Exists for `AdminSettingsService.updatePlatformSettings`' lockout guard: `socialLoginEnabled`
   * is what decides whether the login screen renders a Google button, so switching it off while
   * one of these admins exists takes away the only way in they have. `invited` rows are excluded
   * (no identity yet, and no session to lose) and so are `disabled` ones (already cannot sign in,
   * so nothing to strand).
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
   * Resolves a Google `sub` to the platform admin that linked it at invite acceptance — the read
   * side of `acceptInviteWithGoogleIdentity`'s write, and the only thing that makes a
   * Google-accepted admin able to sign in ever again: that admin has no `password_hash` at all, and
   * platform admins have no refresh token, so without this lookup their session ended 15 minutes
   * after acceptance with no way back (`revokeInvite`/`deleteExpiredInvite` are both scoped to
   * `status = 'invited'`, so even re-inviting the address was impossible).
   *
   * Keyed on `(provider, provider_user_id)` — the table's own unique index, and deliberately not
   * the email: a Workspace address can be reassigned, a Google `sub` never is.
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
   * Read-only preview for `GET /v1/auth/invite/:token` and the Google-authorize route — so both
   * can fail fast on a dead link before ever asking the invitee for a password or redirecting to
   * Google. Deliberately does **not** join on `platform_admins.status`: the invite row's own
   * `used_at`/`expires_at` are the only source of truth for "still redeemable", and the two are
   * never allowed to disagree (both `acceptInviteWithPassword`/`WithGoogleIdentity` below flip
   * both in the same transaction).
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
   * Redeems an invite by setting a password — the shared first two steps
   * (`lockLiveInvite`/consuming it) are identical to `acceptInviteWithGoogleIdentity` below; only
   * what happens to `platform_admins` differs (a password hash here, an identity row there).
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
        // this write — the invite row was live a moment ago, the admin row no longer is.
        return { outcome: 'invalid' };
      }

      await this.consumeInvite(tx, invite.id);
      // Always null: a just-accepted invite has no prior session to have set a preference from.
      return { outcome: 'accepted', id: admin.id, email: admin.email, locale: null };
    });
  }

  /**
   * Redeems an invite by linking a Google identity instead of setting a password — see
   * `acceptInviteWithPassword`'s own comment. `AuthService.completeAdminInviteGoogle` has already
   * confirmed the Google account's verified email matches the invited address before calling this;
   * this method itself does not re-check that (it has no `email` to check against —
   * `platform_admin_identities` carries no email column).
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
          // This Google account is already linked to a *different* admin
          // (`idx_platform_admin_identities_provider_provider_user_id`). Rolled back atomically
          // with the transaction — the admin above is not left half-activated with no identity.
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
   * Locks the live invite row (unused, unexpired) inside the caller's transaction so a concurrent
   * redemption of the same token cannot also pass — the row-level lock, not just the `used_at`
   * check on the later `UPDATE`, is what actually closes the double-submit race.
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
