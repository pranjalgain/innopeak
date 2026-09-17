import { REFRESH_TOKEN_REVOKED_RETENTION_HOURS } from '@auth/constants/auth.constants';
import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { TokenPurpose } from '@auth/enums/token-purpose.enum';
import { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import type { Locale } from '@common/i18n/locale';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

export interface UserByEmail {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  status: UserStatus;
  /** Null means "never chose" — see the `locale` column comment in 0002_tenant_auth.sql. */
  locale: Locale | null;
}

export interface PlatformAdminByEmail {
  id: string;
  email: string;
  /** Null for an `invited` admin who hasn't accepted their invite/set a password yet. */
  passwordHash: string | null;
  status: PlatformAdminStatus;
}

export interface InsertedTenant {
  id: string;
}

export interface InsertedUser {
  id: string;
}

export interface InsertTenantInput {
  name: string;
}

export interface InsertOwnerUserInput {
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string;
}

export interface InsertTenantSettingsInput {
  tenantId: string;
}

export interface InsertVerifiedOwnerUserInput {
  tenantId: string;
  name: string;
  email: string;
}

export interface InsertUserIdentityInput {
  userId: string;
  provider: UserIdentityProvider;
  providerUserId: string;
  email: string;
}

export interface UserIdentityRow {
  userId: string;
}

export interface PutVerifyEmailTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}

export interface InsertRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}

/**
 * Every `token_purpose` this codebase actually mints, and therefore every one the nightly
 * `deleteStaleOtpTokens` sweep has to cover — a purpose that writes rows but is missing here is
 * one whose spent rows nothing ever deletes.
 *
 * `invite`/`reset` are absent because nothing writes them yet (see `TokenPurpose`); whichever
 * commit starts to must add them here too.
 */
export const PURGEABLE_OTP_PURPOSES = [
  TokenPurpose.VERIFY_EMAIL,
  TokenPurpose.SET_PASSWORD,
] as const;

/** A refresh-token row that may or may not still be live — see `findRefreshTokenByHash`. */
export interface RefreshTokenRow {
  id: string;
  userId: string;
  /** Null while the token is still spendable; otherwise when it was rotated out or revoked. */
  revokedAt: string | null;
}

/**
 * Mechanical Drizzle queries only — no cross-table composition or transaction ownership, that's
 * AuthDbService's job (apps/backend/docs/conventions/module-structure.md). Every write method
 * takes the transaction handle explicitly rather than defaulting to `dbService.db`, since every
 * current caller runs inside an AuthDbService-owned transaction. The transaction handle is the
 * one parameter allowed to stay positional alongside a named input — everything else is grouped
 * into an interface even where it's just one field, for consistency across the module.
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Global lookup — deliberately NOT scoped to a tenant or to any status. `users.email` is only
   * unique per-tenant (`idx_users_tenant_id_email`), which is what lets signup create a brand new
   * tenant per attempt; the "is this email already registered anywhere" check signup now does
   * needs to see across every tenant, and login needs to find the account regardless of its
   * status to decide which of the login branches applies. Excludes anonymized accounts — their
   * email is considered freed for reuse.
   */
  async findUserByEmail(email: string): Promise<UserByEmail | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.users.id,
        tenantId: schema.users.tenantId,
        name: schema.users.name,
        email: schema.users.email,
        passwordHash: schema.users.passwordHash,
        role: schema.users.role,
        status: schema.users.status,
        locale: schema.users.locale,
      })
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.anonymizedAt)))
      .orderBy(desc(schema.users.createdAt))
      .limit(1);

    // Drizzle infers `role`/`status` as the pgEnum's own plain string-literal union, not the
    // app-level enum — this repository is the one place that boundary is bridged, since the
    // literal values are guaranteed identical (the enum's members are defined from the same
    // strings the migration creates).
    return (rows[0] as UserByEmail | undefined) ?? null;
  }

  /** Same shape as `findUserByEmail`, keyed by id — used by refresh/logout, which only have the user id (from the JWT `sub`/DB row), not the email. */
  async findUserById(id: string): Promise<UserByEmail | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.users.id,
        tenantId: schema.users.tenantId,
        name: schema.users.name,
        email: schema.users.email,
        passwordHash: schema.users.passwordHash,
        role: schema.users.role,
        status: schema.users.status,
        locale: schema.users.locale,
      })
      .from(schema.users)
      .where(and(eq(schema.users.id, id), isNull(schema.users.anonymizedAt)))
      .limit(1);

    return (rows[0] as UserByEmail | undefined) ?? null;
  }

  /**
   * Global lookup by email, same shape as `findUserByEmail` — `idx_platform_admins_email` is a
   * genuine unique index (not merely per-tenant, since there is no tenant scoping for this
   * table), so at most one row can ever match. No status filter: `login` needs to see `invited`/
   * `disabled` rows too, to answer with the right branch rather than a generic "no such account".
   */
  async findPlatformAdminByEmail(email: string): Promise<PlatformAdminByEmail | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.platformAdmins.id,
        email: schema.platformAdmins.email,
        passwordHash: schema.platformAdmins.passwordHash,
        status: schema.platformAdmins.status,
      })
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.email, email))
      .limit(1);

    return (rows[0] as PlatformAdminByEmail | undefined) ?? null;
  }

  /** `name` rides along even though most callers only check `status` — same row, no extra query. */
  async findTenantStatusById(
    tenantId: string
  ): Promise<{ status: TenantStatus; name: string } | null> {
    const rows = await this.dbService.db
      .select({ status: schema.tenants.status, name: schema.tenants.name })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    return (rows[0] as { status: TenantStatus; name: string } | undefined) ?? null;
  }

  /** Row-existence is the only signal for "has this tenant connected a Google Business Profile" — no dedicated flag exists on `tenants`/`tenant_settings`. */
  /**
   * The same rule `GET /v1/connections` uses for `connected`: a live, active connection **and** an
   * active location. This only drives the post-login redirect (the dashboard guard is
   * authoritative), but a bare row-existence probe over-reported — a tenant who had disconnected
   * still read as connected, was routed to the dashboard, and was immediately bounced back to
   * onboarding by the guard.
   */
  async hasConnectedBusiness(tenantId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .select({ id: schema.locations.id })
      .from(schema.locations)
      .innerJoin(
        schema.reviewProviderConnections,
        eq(schema.reviewProviderConnections.id, schema.locations.providerConnectionId)
      )
      .where(
        and(
          eq(schema.locations.tenantId, tenantId),
          eq(schema.locations.status, LocationStatus.ACTIVE),
          eq(schema.reviewProviderConnections.status, ReviewProviderConnectionStatus.ACTIVE),
          isNull(schema.reviewProviderConnections.disconnectedAt)
        )
      )
      .limit(1);

    return rows.length > 0;
  }

  /** Null means either "never chosen" or the chosen location was later removed (`ON DELETE SET
   *  NULL`) — `ConnectionsService.getConnectionStatus` falls back to the tenant's first active
   *  location in both cases, so the two are not distinguished here. */
  async findActiveLocationId(tenantId: string): Promise<string | null> {
    const rows = await this.dbService.db
      .select({ activeLocationId: schema.tenants.activeLocationId })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    return rows[0]?.activeLocationId ?? null;
  }

  /** A single shared value for the whole tenant — see the column comment in
   *  0003_review_provider_locations.sql. The caller (`ConnectionsService.setActiveLocation`)
   *  is what restricts this to an owner and validates the location belongs to the tenant; this
   *  method itself trusts its input. */
  async updateActiveLocationId(
    tx: DrizzleTransaction,
    input: { tenantId: string; locationId: string | null }
  ): Promise<void> {
    await tx
      .update(schema.tenants)
      .set({ activeLocationId: input.locationId, updatedAt: sql`now()` })
      .where(eq(schema.tenants.id, input.tenantId));
  }

  async insertTenant(tx: DrizzleTransaction, input: InsertTenantInput): Promise<InsertedTenant> {
    const rows = await tx
      .insert(schema.tenants)
      .values({ name: input.name })
      .returning({ id: schema.tenants.id });
    const row = rows[0];

    if (!row) {
      throw new Error('Failed to create tenant');
    }

    return row;
  }

  async insertOwnerUser(
    tx: DrizzleTransaction,
    input: InsertOwnerUserInput
  ): Promise<InsertedUser> {
    const rows = await tx
      .insert(schema.users)
      .values({
        tenantId: input.tenantId,
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        role: UserRole.OWNER,
        status: UserStatus.PENDING_VERIFICATION,
      })
      .returning({ id: schema.users.id });
    const row = rows[0];

    if (!row) {
      throw new Error('Failed to create user');
    }

    return row;
  }

  async insertTenantSettings(
    tx: DrizzleTransaction,
    input: InsertTenantSettingsInput
  ): Promise<void> {
    // `escalation_rating_threshold` is left to its column default (3) — one source of truth for
    // the product default, in the schema. `auto_post_enabled` is written explicitly even though
    // it defaults to false, because "never post without a human in the MVP" is an app-level
    // guarantee (PLAN.md §8) and worth stating at the insert rather than inheriting silently.
    await tx.insert(schema.tenantSettings).values({
      tenantId: input.tenantId,
      autoPostEnabled: false,
      reviewDataRetentionMonths: null,
    });
  }

  /**
   * Upserts on `(user_id, purpose)`, not `token_hash` — a verify_email code is a 6-digit OTP, not
   * a 256-bit random value, so `token_hash` can't be the identity of "this user's live code"
   * (two users can land on the same digits at the same time). `idx_password_reset_tokens_user_id_purpose`
   * enforces at most one live row per user per purpose; issuing a fresh code (signup, a
   * login-triggered resend, or an explicit resend click) always overwrites that same row. This
   * also covers the dev fixed-code bypass with no special-cased second method — a fixed value is
   * just another code that happens to repeat across upserts.
   */
  async putVerifyEmailToken(
    tx: DrizzleTransaction,
    input: PutVerifyEmailTokenInput
  ): Promise<void> {
    await tx
      .insert(schema.passwordResetTokens)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        purpose: TokenPurpose.VERIFY_EMAIL,
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: [schema.passwordResetTokens.userId, schema.passwordResetTokens.purpose],
        set: {
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          usedAt: null,
          updatedAt: sql`now()`,
        },
      });
  }

  /**
   * Compare-and-swap, not check-then-write (auth API reference's Security considerations,
   * `PLAN.md` §8.7): the `used_at IS NULL AND expires_at > now()` guard lives in the `WHERE`
   * clause of the same `UPDATE` that consumes the token, so two simultaneous requests for the
   * same code can't both see it as valid — the loser's `UPDATE` matches zero rows. Scoped by
   * `userId` (the caller already resolved it via `findUserByEmail`) as well as `tokenHash`, since
   * `token_hash` is no longer unique across users.
   */
  async consumeVerifyEmailToken(
    tx: DrizzleTransaction,
    input: { userId: string; tokenHash: string }
  ): Promise<boolean> {
    const rows = await tx
      .update(schema.passwordResetTokens)
      .set({ usedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.passwordResetTokens.userId, input.userId),
          eq(schema.passwordResetTokens.tokenHash, input.tokenHash),
          eq(schema.passwordResetTokens.purpose, TokenPurpose.VERIFY_EMAIL),
          isNull(schema.passwordResetTokens.usedAt),
          gt(schema.passwordResetTokens.expiresAt, sql`now()`)
        )
      )
      .returning({ id: schema.passwordResetTokens.id });

    return rows.length > 0;
  }

  async updatePasswordHash(
    tx: DrizzleTransaction,
    input: { userId: string; passwordHash: string }
  ): Promise<void> {
    await tx
      .update(schema.users)
      .set({ passwordHash: input.passwordHash, updatedAt: sql`now()` })
      .where(eq(schema.users.id, input.userId));
  }

  async updateLocale(
    tx: DrizzleTransaction,
    input: { userId: string; locale: Locale }
  ): Promise<void> {
    await tx
      .update(schema.users)
      .set({ locale: input.locale, updatedAt: sql`now()` })
      .where(eq(schema.users.id, input.userId));
  }

  /**
   * Discards a password that was set but never proven — see `AuthDbService.resolveGoogleIdentity`.
   *
   * A `pending_verification` row's `password_hash` was chosen by whoever typed it into signup,
   * which is not necessarily the person who owns the mailbox. Activating that row off an SSO
   * assertion (which proves only the mailbox) would leave the unproven password live on a now-real
   * account, so it is dropped instead. The account keeps working through SSO and can adopt a
   * password later via `POST /v1/auth/set-password`.
   */
  async clearPasswordHash(tx: DrizzleTransaction, userId: string): Promise<void> {
    await tx
      .update(schema.users)
      .set({ passwordHash: null, updatedAt: sql`now()` })
      .where(eq(schema.users.id, userId));
  }

  /** Drops any outstanding verify-email code for a user — its purpose is served, or (see `clearPasswordHash`) it belonged to a signup attempt that is no longer trusted. */
  async deleteVerifyEmailTokensForUser(tx: DrizzleTransaction, userId: string): Promise<void> {
    await tx
      .delete(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.userId, userId),
          eq(schema.passwordResetTokens.purpose, TokenPurpose.VERIFY_EMAIL)
        )
      );
  }

  /**
   * Same upsert-on-(user_id, purpose) shape as `putVerifyEmailToken`, under the `token_purpose`
   * enum's own `set_password` value. This is the step-up proof `AuthService.setPassword` requires
   * before converting an access token (a 15-minute credential) into a permanent one on a
   * passwordless account: without it, a stolen access token alone was sufficient.
   *
   * Deliberately NOT `reset`, which the auth API reference reserves for the (unbuilt) public
   * forgot-password route: one shared value would make this upsert silently invalidate a live
   * reset token, and would let a code minted here — behind an access token — satisfy a consume
   * from that unauthenticated route, and vice versa.
   */
  async putSetPasswordOtp(tx: DrizzleTransaction, input: PutVerifyEmailTokenInput): Promise<void> {
    await tx
      .insert(schema.passwordResetTokens)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        purpose: TokenPurpose.SET_PASSWORD,
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: [schema.passwordResetTokens.userId, schema.passwordResetTokens.purpose],
        set: {
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          usedAt: null,
          updatedAt: sql`now()`,
        },
      });
  }

  /** `consumeVerifyEmailToken`'s CAS shape, scoped to the `set_password`-purpose row `putSetPasswordOtp` writes. */
  async consumeSetPasswordOtp(
    tx: DrizzleTransaction,
    input: { userId: string; tokenHash: string }
  ): Promise<boolean> {
    const rows = await tx
      .update(schema.passwordResetTokens)
      .set({ usedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.passwordResetTokens.userId, input.userId),
          eq(schema.passwordResetTokens.tokenHash, input.tokenHash),
          eq(schema.passwordResetTokens.purpose, TokenPurpose.SET_PASSWORD),
          isNull(schema.passwordResetTokens.usedAt),
          gt(schema.passwordResetTokens.expiresAt, sql`now()`)
        )
      )
      .returning({ id: schema.passwordResetTokens.id });

    return rows.length > 0;
  }

  /**
   * Scoped to `status = 'pending_verification'` defensively — a verify_email token should never
   * exist for a user in any other status today, but this guards against a stale/reused token
   * silently reactivating an account that isn't actually pending verification. Returns whether it
   * actually changed anything, so the caller can tell a real activation from a guard-blocked
   * no-op instead of treating both as success.
   */
  async activateUser(tx: DrizzleTransaction, userId: string): Promise<boolean> {
    const rows = await tx
      .update(schema.users)
      .set({ status: UserStatus.ACTIVE, emailVerifiedAt: sql`now()` })
      .where(
        and(eq(schema.users.id, userId), eq(schema.users.status, UserStatus.PENDING_VERIFICATION))
      )
      .returning({ id: schema.users.id });

    return rows.length > 0;
  }

  /**
   * Moves a tenant off the `pending_activation` default it is created with. Called wherever an
   * owner's email becomes proven — OTP verification, or a Google signup/link, where Google has
   * already verified it. Without this the column stayed `pending_activation` for the life of every
   * tenant, since nothing else ever wrote it.
   *
   * Scoped to `pending_activation` so it can never resurrect a `suspended` tenant: suspension is
   * an admin decision, and a member verifying their email must not undo it.
   */
  async activateTenant(tx: DrizzleTransaction, tenantId: string): Promise<void> {
    await tx
      .update(schema.tenants)
      .set({ status: TenantStatus.ACTIVE, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.tenants.id, tenantId),
          eq(schema.tenants.status, TenantStatus.PENDING_ACTIVATION)
        )
      );
  }

  async insertRefreshToken(tx: DrizzleTransaction, input: InsertRefreshTokenInput): Promise<void> {
    await tx.insert(schema.refreshTokens).values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });
  }

  /**
   * A refresh-token row found **without** filtering on `revoked_at IS NULL` — so a token that was
   * already spent is still found, along with when it was spent.
   *
   * That is what makes reuse detection possible: "not active" collapses three very different
   * situations (never existed, expired, already rotated out), and only the third is a signal that
   * a spent token is still in circulation. `revokedAt` lets the caller separate a lost rotation
   * race moments ago from a replay minutes later — see `TokenService.rotate` and
   * `REFRESH_REUSE_GRACE_SECONDS`.
   *
   * Still excludes expired tokens: past `expires_at` nothing can be honored or inferred, and the
   * daily purge deletes those rows anyway.
   */
  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.refreshTokens.id,
        userId: schema.refreshTokens.userId,
        revokedAt: schema.refreshTokens.revokedAt,
      })
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.tokenHash, tokenHash),
          gt(schema.refreshTokens.expiresAt, sql`now()`)
        )
      )
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * "Does this user still have *any* live session?" — the question that separates a refresh
   * token that lost a rotation race from one whose whole family is dead.
   *
   * Both cases reach `TokenService.rotate()` as "the presented token is not active", but they
   * want opposite handling at the cookie layer: a token superseded moments ago by a concurrent
   * refresh sits alongside a perfectly good successor (the winner's), and the browser already
   * holds it, so the failed caller must not clear cookies. A revoked-on-logout, expired, or
   * DB-reset-away token has no successor, and the cookies genuinely need clearing or the
   * frontend's session hint outlives the session. See `AuthController.refresh`.
   */
  async hasActiveRefreshToken(userId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .select({ id: schema.refreshTokens.id })
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.userId, userId),
          isNull(schema.refreshTokens.revokedAt),
          gt(schema.refreshTokens.expiresAt, sql`now()`)
        )
      )
      .limit(1);

    return rows.length > 0;
  }

  /**
   * Compare-and-swap, same shape as `consumeVerifyEmailToken`: the `revoked_at IS NULL` guard is
   * in the `UPDATE`'s own `WHERE`, so of N concurrent rotations of one token exactly one sees a
   * row change. Returns whether this call was that one — the caller must treat `false` as "this
   * token was already spent" rather than proceeding to issue a replacement (observed before this:
   * 5 concurrent refreshes of one token → 5 live sessions).
   */
  async revokeRefreshToken(tx: DrizzleTransaction, id: string): Promise<boolean> {
    const rows = await tx
      .update(schema.refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(schema.refreshTokens.id, id), isNull(schema.refreshTokens.revokedAt)))
      .returning({ id: schema.refreshTokens.id });

    return rows.length > 0;
  }

  /**
   * Housekeeping — a consumed or expired OTP has no further use once its window is over. Returns
   * the number of rows removed.
   */
  async deleteStaleOtpTokens(tx: DrizzleTransaction): Promise<number> {
    const rows = await tx
      .delete(schema.passwordResetTokens)
      .where(
        and(
          inArray(schema.passwordResetTokens.purpose, PURGEABLE_OTP_PURPOSES),
          or(
            isNotNull(schema.passwordResetTokens.usedAt),
            lt(schema.passwordResetTokens.expiresAt, sql`now()`)
          )
        )
      )
      .returning({ id: schema.passwordResetTokens.id });

    return rows.length;
  }

  /**
   * Housekeeping — an expired refresh token can never be honored again
   * (`findRefreshTokenByHash` already excludes expired ones), so that row is dead weight
   * immediately. A revoked row is different: `TokenService.handleSpentToken` needs it to still
   * exist to tell a reuse replay from a lost rotation race, so it's kept for at least
   * `REFRESH_TOKEN_REVOKED_RETENTION_HOURS` past `revokedAt` — see that constant's own comment for
   * why a bare "revoked at all" check here previously gave replay detection an unpredictable
   * (sometimes near-zero) window instead of a consistent one. Returns the number of rows removed.
   */
  async deleteStaleRefreshTokens(tx: DrizzleTransaction): Promise<number> {
    const rows = await tx
      .delete(schema.refreshTokens)
      .where(
        or(
          and(
            isNotNull(schema.refreshTokens.revokedAt),
            lt(
              schema.refreshTokens.revokedAt,
              sql`now() - interval '1 hour' * ${REFRESH_TOKEN_REVOKED_RETENTION_HOURS}`
            )
          ),
          lt(schema.refreshTokens.expiresAt, sql`now()`)
        )
      )
      .returning({ id: schema.refreshTokens.id });

    return rows.length;
  }

  async revokeAllRefreshTokensForUser(tx: DrizzleTransaction, userId: string): Promise<void> {
    await tx
      .update(schema.refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(schema.refreshTokens.userId, userId), isNull(schema.refreshTokens.revokedAt)));
  }

  /** Identity lookup keyed on Google's stable `sub`, never the email — an email can be reassigned. */
  async findUserIdByIdentity(
    provider: UserIdentityProvider,
    providerUserId: string
  ): Promise<UserIdentityRow | null> {
    const rows = await this.dbService.db
      .select({ userId: schema.userIdentities.userId })
      .from(schema.userIdentities)
      .where(
        and(
          eq(schema.userIdentities.provider, provider),
          eq(schema.userIdentities.providerUserId, providerUserId)
        )
      )
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Idempotent on `idx_user_identities_provider_provider_user_id`. A second sign-in with the same
   * Google account refreshes the recorded email rather than raising a 23505 — the email on the
   * identity is a convenience copy, and Workspace accounts do get renamed.
   */
  async upsertUserIdentity(tx: DrizzleTransaction, input: InsertUserIdentityInput): Promise<void> {
    await tx
      .insert(schema.userIdentities)
      .values({
        userId: input.userId,
        provider: input.provider,
        providerUserId: input.providerUserId,
        email: input.email,
      })
      .onConflictDoUpdate({
        target: [schema.userIdentities.provider, schema.userIdentities.providerUserId],
        set: { email: input.email, updatedAt: sql`now()` },
      });
  }

  /**
   * The SSO counterpart to `insertOwnerUser`. Created `active` with `email_verified_at` already
   * set, and with no password hash: Google has verified the address, so there is no OTP to send
   * and nothing to verify. That is also why this path must provision the tenant's workspace
   * itself — it never passes through `verifyEmail`, which is where password signups get theirs.
   */
  async insertVerifiedOwnerUser(
    tx: DrizzleTransaction,
    input: InsertVerifiedOwnerUserInput
  ): Promise<InsertedUser> {
    const rows = await tx
      .insert(schema.users)
      .values({
        tenantId: input.tenantId,
        name: input.name,
        email: input.email,
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: sql`now()`,
      })
      .returning({ id: schema.users.id });
    const row = rows[0];

    if (!row) {
      throw new Error('Failed to create user');
    }

    return row;
  }

  /**
   * The one place `DBService`'s raw connection is touched for a transaction boundary — keeps
   * that fully inside the Repository (module-structure.md: "only Repositories talk to the raw
   * connection"), so AuthDbService composes transactions through this passthrough instead of
   * injecting `DBService` itself.
   */
  async transaction<T>(fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(fn);
  }
}
