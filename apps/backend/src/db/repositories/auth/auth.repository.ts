import { REFRESH_TOKEN_REVOKED_RETENTION_HOURS } from '@auth/constants/auth.constants';
import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { TokenPurpose } from '@auth/enums/token-purpose.enum';
import { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import type { Locale } from '@common/i18n/locale';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { acquireResourceXactLock } from '@db/helpers/advisory-lock.util';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type {
  AcceptMemberInviteOutcome,
  AcquireErasureLock,
  CancelMemberRemovalOutcome,
  InsertedTenant,
  InsertedUser,
  InsertInvitedMemberInput,
  InsertMemberInviteTokenInput,
  InsertNotificationRecipientInput,
  InsertOwnerUserInput,
  InsertRefreshTokenInput,
  InsertTenantInput,
  InsertTenantSettingsInput,
  InsertUserIdentityInput,
  InsertVerifiedOwnerUserInput,
  MemberInviteStatusRow,
  PutVerifyEmailTokenInput,
  RefreshTokenRow,
  RequestMemberRemovalOutcome,
  RevokeMemberInviteOutcome,
  TenantMemberRow,
  UserByEmail,
  UserIdentityRow,
} from './types/auth.type';

/**
 * Every `token_purpose` this codebase actually mints, and therefore every one the nightly
 * `deleteStaleOtpTokens` sweep has to cover — a purpose that writes rows but is missing here is
 * one whose spent rows nothing ever deletes.
 *
 * `INVITE` (tenant-member invites — `insertInvitedMember`/`acceptMemberInviteWith*`) joined this
 * list the day that flow started writing rows here; a used or lapsed invite token is exactly the
 * same kind of dead weight `VERIFY_EMAIL`/`SET_PASSWORD` already are. `reset` stays absent —
 * nothing writes it yet (see `TokenPurpose`).
 */
export const PURGEABLE_OTP_PURPOSES = [
  TokenPurpose.VERIFY_EMAIL,
  TokenPurpose.SET_PASSWORD,
  TokenPurpose.INVITE,
] as const;

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
      throw new Error(MESSAGES.AUTH.FAILED_TO_CREATE_TENANT);
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
      throw new Error(MESSAGES.AUTH.FAILED_TO_CREATE_USER);
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
   * Seeds the new owner as the tenant's one escalation recipient — `channel`/`type` left to their
   * column defaults (`email`/`escalation`, the only values either has today). Without this, a
   * brand-new tenant has zero `notification_recipients` rows and every future escalation would be
   * a silent, correct-but-useless no-op forever; there is no add-recipient route yet for anyone to
   * fix that after the fact. Same "the row must exist, not just the value" reasoning as
   * `insertTenantSettings` above.
   */
  async insertNotificationRecipient(
    tx: DrizzleTransaction,
    input: InsertNotificationRecipientInput
  ): Promise<void> {
    await tx.insert(schema.notificationRecipients).values({
      tenantId: input.tenantId,
      userId: input.userId,
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
      throw new Error(MESSAGES.AUTH.FAILED_TO_CREATE_USER);
    }

    return row;
  }

  /**
   * Creates the invited member's own `users` row — `status: invited`, no password, attributed to
   * the owner who sent the invite. Mirrors `PlatformAdminRepository.insertInvitedAdmin`; the one
   * structural difference is there is no separate invite-row table to also write here — the
   * invite token lives on `password_reset_tokens` (`insertMemberInviteToken`), inserted as its own
   * statement in the same transaction, same as `signup`'s `insertOwnerUser` +
   * `putVerifyEmailToken` pair.
   */
  async insertInvitedMember(
    tx: DrizzleTransaction,
    input: InsertInvitedMemberInput
  ): Promise<InsertedUser> {
    const rows = await tx
      .insert(schema.users)
      .values({
        tenantId: input.tenantId,
        name: input.name,
        email: input.email,
        role: UserRole.MEMBER,
        status: UserStatus.INVITED,
        invitedByUserId: input.invitedByUserId,
      })
      .returning({ id: schema.users.id });
    const row = rows[0];

    if (!row) {
      throw new Error(MESSAGES.AUTH.FAILED_TO_CREATE_INVITED_MEMBER);
    }

    return row;
  }

  /** A plain insert, not an upsert — a brand-new `users` row from `insertInvitedMember` never has
   *  a prior invite token to replace, unlike `putVerifyEmailToken`'s upsert-on-`(user_id, purpose)`
   *  shape for a row that can be re-issued a code many times over its life. */
  async insertMemberInviteToken(
    tx: DrizzleTransaction,
    input: InsertMemberInviteTokenInput
  ): Promise<void> {
    await tx.insert(schema.passwordResetTokens).values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      purpose: TokenPurpose.INVITE,
      expiresAt: input.expiresAt,
    });
  }

  /**
   * Global lookup, not tenant-scoped — mirrors `PlatformAdminRepository.findByEmail` for the same
   * reason: `idx_users_email_active` is a global uniqueness guarantee (one non-anonymized account
   * per email, across every tenant), so "is this email already claimed" has to check globally
   * before `TenantMembersService.sendInvite` ever attempts the insert. `inviteExpiresAt` comes from
   * the left-joined `invite`-purpose `password_reset_tokens` row, `null` for anyone who wasn't
   * invited (a self-registered or platform-admin-provisioned owner).
   */
  async findMemberInviteStatusByEmail(email: string): Promise<MemberInviteStatusRow | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.users.id,
        tenantId: schema.users.tenantId,
        status: schema.users.status,
        inviteExpiresAt: schema.passwordResetTokens.expiresAt,
      })
      .from(schema.users)
      .leftJoin(
        schema.passwordResetTokens,
        and(
          eq(schema.passwordResetTokens.userId, schema.users.id),
          eq(schema.passwordResetTokens.purpose, TokenPurpose.INVITE)
        )
      )
      .where(and(eq(schema.users.email, email), isNull(schema.users.anonymizedAt)))
      .limit(1);

    return (rows[0] as MemberInviteStatusRow | undefined) ?? null;
  }

  /**
   * Read-only preview for `GET /v1/auth/invite/:token` and the Google-authorize route — so both
   * can fail fast on a dead link before ever asking the invitee for a name/password or redirecting
   * to Google. Mirrors `PlatformAdminRepository.findInviteEmailByTokenHash`: the invite row's own
   * `used_at`/`expires_at` are the only source of truth for "still redeemable", never
   * `users.status` — `acceptMemberInviteWith*` below flip both in the same transaction, so they
   * can never disagree.
   */
  async findMemberInviteEmailByTokenHash(
    tokenHash: string
  ): Promise<{ email: string; tenantId: string } | null> {
    const rows = await this.dbService.db
      .select({ email: schema.users.email, tenantId: schema.users.tenantId })
      .from(schema.passwordResetTokens)
      .innerJoin(schema.users, eq(schema.users.id, schema.passwordResetTokens.userId))
      .where(
        and(
          eq(schema.passwordResetTokens.tokenHash, tokenHash),
          eq(schema.passwordResetTokens.purpose, TokenPurpose.INVITE),
          isNull(schema.passwordResetTokens.usedAt),
          gt(schema.passwordResetTokens.expiresAt, sql`now()`)
        )
      )
      .limit(1);

    return (rows[0] as { email: string; tenantId: string } | undefined) ?? null;
  }

  /**
   * Redeems a member invite by setting a name and password — the shared first step
   * (`lockLiveMemberInvite`) is identical to `acceptMemberInviteWithGoogleIdentity` below; only
   * what happens to `users` differs (a name + password hash here, a name + identity row there).
   */
  async acceptMemberInviteWithPassword(input: {
    tokenHash: string;
    name: string;
    passwordHash: string;
  }): Promise<AcceptMemberInviteOutcome> {
    return this.dbService.db.transaction(async tx => {
      const invite = await this.lockLiveMemberInvite(tx, input.tokenHash);
      if (!invite) {
        return { outcome: 'invalid' };
      }

      const activated = await tx
        .update(schema.users)
        .set({
          name: input.name,
          passwordHash: input.passwordHash,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(schema.users.id, invite.userId), eq(schema.users.status, UserStatus.INVITED)))
        .returning({
          id: schema.users.id,
          tenantId: schema.users.tenantId,
          email: schema.users.email,
          name: schema.users.name,
        });

      const member = activated[0];
      if (!member) {
        // Raced with something else accepting/removing the same member between the lock above and
        // this write — the invite row was live a moment ago, the users row no longer is.
        return { outcome: 'invalid' };
      }

      await this.consumeMemberInvite(tx, invite.id);
      return {
        outcome: 'accepted',
        id: member.id,
        tenantId: member.tenantId,
        // `email`/`name` are nullable at the column level (GDPR anonymize-in-place, see
        // `users.name`'s own doc comment) but provably set here: this row's `status` was just
        // `invited` (never anonymized — only an active/accepted member is ever anonymized) and
        // `name` was set by this very UPDATE, from a required, non-null `input.name`.
        email: member.email!,
        name: member.name!,
      };
    });
  }

  /**
   * Redeems a member invite by linking a Google identity and setting a name, instead of a
   * password. `AuthService.completeMemberInviteGoogle` has already confirmed the Google account's
   * verified email matches the invited address before calling this.
   *
   * A plain insert into `user_identities`, not `upsertUserIdentity` — that method's
   * `onConflictDoUpdate` on `(provider, provider_user_id)` exists for a *returning* user relinking
   * their own account, and reusing it here would silently steal a Google identity already linked
   * to a *different* user rather than reporting `identity_already_linked`, the same distinction
   * `PlatformAdminRepository.acceptInviteWithGoogleIdentity`'s own comment makes.
   */
  async acceptMemberInviteWithGoogleIdentity(input: {
    tokenHash: string;
    providerUserId: string;
    email: string;
    name: string;
  }): Promise<AcceptMemberInviteOutcome> {
    return this.dbService.db.transaction(async tx => {
      const invite = await this.lockLiveMemberInvite(tx, input.tokenHash);
      if (!invite) {
        return { outcome: 'invalid' };
      }

      const activated = await tx
        .update(schema.users)
        .set({
          name: input.name,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(schema.users.id, invite.userId), eq(schema.users.status, UserStatus.INVITED)))
        .returning({
          id: schema.users.id,
          tenantId: schema.users.tenantId,
          email: schema.users.email,
          name: schema.users.name,
        });

      const member = activated[0];
      if (!member) {
        return { outcome: 'invalid' };
      }

      try {
        await tx.insert(schema.userIdentities).values({
          userId: member.id,
          provider: UserIdentityProvider.GOOGLE,
          providerUserId: input.providerUserId,
          email: input.email,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          // This Google account is already linked to a *different* user
          // (`idx_user_identities_provider_provider_user_id`). Rolled back atomically with the
          // transaction — the member above is not left half-activated with no identity.
          return { outcome: 'identity_already_linked' };
        }
        throw error;
      }

      await this.consumeMemberInvite(tx, invite.id);
      return {
        outcome: 'accepted',
        id: member.id,
        tenantId: member.tenantId,
        // Same reasoning as `acceptMemberInviteWithPassword`'s own comment — this row was just
        // `invited` (never anonymized) and `name` was just set by this UPDATE.
        email: member.email!,
        name: member.name!,
      };
    });
  }

  /**
   * Locks the live invite row (unused, unexpired) inside the caller's transaction so a concurrent
   * redemption of the same token cannot also pass — mirrors
   * `PlatformAdminRepository.lockLiveInvite` exactly, on `password_reset_tokens` instead of
   * `platform_admin_invites`.
   */
  private async lockLiveMemberInvite(
    tx: DrizzleTransaction,
    tokenHash: string
  ): Promise<{ id: string; userId: string } | null> {
    const rows = await tx
      .select({ id: schema.passwordResetTokens.id, userId: schema.passwordResetTokens.userId })
      .from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.tokenHash, tokenHash),
          eq(schema.passwordResetTokens.purpose, TokenPurpose.INVITE),
          isNull(schema.passwordResetTokens.usedAt),
          gt(schema.passwordResetTokens.expiresAt, sql`now()`)
        )
      )
      .for('update')
      .limit(1);

    return (rows[0] as { id: string; userId: string } | undefined) ?? null;
  }

  private async consumeMemberInvite(tx: DrizzleTransaction, inviteId: string): Promise<void> {
    await tx
      .update(schema.passwordResetTokens)
      .set({ usedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(schema.passwordResetTokens.id, inviteId));
  }

  /**
   * Deletes the invited member's own row outright — not a soft-disable, since the member never
   * accepted and never had a real account to begin with. Scoped to `status = 'invited'` AND
   * `tenant_id` so an owner can never revoke another tenant's pending invite or a member who has
   * since accepted.
   *
   * **Both** statements carry that tenant scope, the token delete included. Filtering the token
   * delete on `user_id` alone was a cross-tenant write: the `users` delete below still refused to
   * match, so the caller correctly got a 404, but the other tenant's invite token was already gone
   * by then and the transaction committed anyway — killing a pending invite in a tenant the caller
   * has no access to, with the 404 making it look like nothing had happened.
   *
   * Deletes the `password_reset_tokens` row explicitly, in its own statement, *before* deleting
   * `users` — deliberately not left to the FK's own `ON DELETE CASCADE`, which would delete them
   * in the opposite order (lock `users` first, cascade to the token second).
   *
   * That ordering matters because `lockLiveMemberInvite` (the accept path's compare-and-swap)
   * locks the token row first and only then updates `users`. Two transactions that acquire the
   * same two locks in *opposite* orders are exactly Postgres's textbook deadlock shape: a revoke
   * racing an in-flight accept could have this method holding the `users` row lock waiting for the
   * token lock accept already holds, while accept waits for the `users` lock this method already
   * holds — a circular wait Postgres can only resolve by aborting one side with a raw `deadlock
   * detected` error instead of the clean 409/400 either path is supposed to produce. Matching
   * accept's own lock order (token, then user) makes that circular wait structurally impossible:
   * whichever transaction gets there first simply finishes before the other can start waiting on
   * it.
   *
   * (`PlatformAdminRepository.deleteInvitedAdmin` has the identical latent risk against
   * `acceptInviteWith*`'s own `lockLiveInvite` — tracked separately, since fixing it touches a
   * different, already-shipped table pair.)
   */
  async deleteInvitedMember(
    tenantId: string,
    memberId: string
  ): Promise<RevokeMemberInviteOutcome> {
    return this.dbService.db.transaction(async tx => {
      await tx.delete(schema.passwordResetTokens).where(
        and(
          eq(schema.passwordResetTokens.purpose, TokenPurpose.INVITE),
          inArray(
            schema.passwordResetTokens.userId,
            tx
              .select({ id: schema.users.id })
              .from(schema.users)
              .where(and(eq(schema.users.id, memberId), eq(schema.users.tenantId, tenantId)))
          )
        )
      );

      const rows = await tx
        .delete(schema.users)
        .where(
          and(
            eq(schema.users.id, memberId),
            eq(schema.users.tenantId, tenantId),
            eq(schema.users.status, UserStatus.INVITED)
          )
        )
        .returning({ id: schema.users.id, email: schema.users.email });

      const deleted = rows[0];
      if (deleted) {
        // `email` is nullable at the column level (GDPR anonymize-in-place) but this row was
        // deleted while still `status = 'invited'` — never-accepted rows are never anonymized,
        // only active/accepted members are — so it's provably the address the invite was sent to.
        return { outcome: 'revoked' as const, email: deleted.email! };
      }

      // Nothing matched: either no such id in this tenant at all, or an id whose row is no longer
      // `invited` (already accepted — in which case the delete above harmlessly removed its
      // already-spent token row, same cleanup the nightly sweep would have done anyway). One extra
      // read only on the failure path, so the happy path stays two statements, not three.
      const existing = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.id, memberId), eq(schema.users.tenantId, tenantId)))
        .limit(1);

      return { outcome: existing.length > 0 ? ('not_invited' as const) : ('not_found' as const) };
    });
  }

  /**
   * Drops a lapsed invite so the same address can be invited again — see
   * `findMemberInviteStatusByEmail` for why a stale row otherwise claims that email forever (the
   * global `idx_users_email_active` index, not merely a per-tenant one). Scoped to `invited` for
   * the same reason `deleteInvitedMember` is: an accepted member must never be removed by an
   * invite-flow path. Global, not tenant-scoped — the row being replaced was found via the global
   * lookup in the first place.
   *
   * Takes the same token-then-user lock order `deleteInvitedMember` does, and for the same reason
   * — see its comment. The window here is narrower (this only runs against an invite the caller
   * has already read as lapsed, and accept only locks a token it reads as live), but "narrower"
   * depends on the app clock and the database clock agreeing about the expiry instant, which is
   * not an invariant worth resting a deadlock on. Every writer of this table pair takes the two
   * locks in one order.
   */
  async deleteExpiredMemberInvite(id: string): Promise<void> {
    await this.dbService.db.transaction(async tx => {
      await tx
        .delete(schema.passwordResetTokens)
        .where(
          and(
            eq(schema.passwordResetTokens.userId, id),
            eq(schema.passwordResetTokens.purpose, TokenPurpose.INVITE)
          )
        );

      await tx
        .delete(schema.users)
        .where(and(eq(schema.users.id, id), eq(schema.users.status, UserStatus.INVITED)));
    });
  }

  /**
   * Every user in a tenant — owner and members alike, invited or active — for the Team Members
   * list. Excludes anonymized rows, same as every other user-facing read in this repository.
   * Ordered oldest-first so the owner (always the first row created) leads the list.
   */
  async listTenantMembers(tenantId: string): Promise<TenantMemberRow[]> {
    const rows = await this.dbService.db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        status: schema.users.status,
        invitedAt: schema.users.createdAt,
        erasureRequestedAt: schema.users.erasureRequestedAt,
      })
      .from(schema.users)
      .where(and(eq(schema.users.tenantId, tenantId), isNull(schema.users.anonymizedAt)))
      .orderBy(schema.users.createdAt);

    return rows as TenantMemberRow[];
  }

  /**
   * Marks an active member `disabled` + `erasure_requested_at = now()` — access is revoked
   * immediately, but the actual anonymization is deferred to the nightly erasure-purge cron job
   * once `ERASURE_GRACE_PERIOD_DAYS` elapses, so a mistaken request can still be cancelled.
   * Self-removal is refused one layer up (`TenantMembersService`, a cheap check that needs no DB
   * round trip) — this method only ever sees a target other than the acting owner.
   *
   * Advisory-lock-guarded against stripping a tenant down to zero owners, same shape as
   * `PlatformAdminRepository.setStatusGuardingLastActive`'s last-active-admin guard: without the
   * lock, two concurrent requests removing the tenant's last two owners could each read "one other
   * owner exists" before either write lands. Scoped to this one tenant via `hashtext(tenantId)` as
   * the second key — unlike the platform-admin guard it mirrors (correctly global there, since
   * platform admins have no tenant partition), this invariant is per-tenant, so two unrelated
   * tenants' removal requests must never serialize against each other. Matches the same
   * per-tenant lock-key shape `ConnectionsRepository.acquireLocationConfirmLock`/
   * `TenantSubscriptionsRepository.acquireCheckoutLock` already use.
   */
  async requestMemberRemoval(
    tenantId: string,
    memberId: string
  ): Promise<RequestMemberRemovalOutcome> {
    return this.dbService.db.transaction(async tx => {
      await acquireResourceXactLock(tx, 'tenants:owner-guard', tenantId);

      const current = await tx
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.id, memberId),
            eq(schema.users.tenantId, tenantId),
            isNull(schema.users.anonymizedAt)
          )
        )
        .limit(1);
      const currentRow = current[0] as { role: UserRole } | undefined;
      if (!currentRow) {
        return { outcome: 'not_found' };
      }

      if (currentRow.role === UserRole.OWNER) {
        const otherOwners = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(schema.users)
          .where(
            and(
              eq(schema.users.tenantId, tenantId),
              eq(schema.users.role, UserRole.OWNER),
              isNull(schema.users.anonymizedAt),
              ne(schema.users.id, memberId)
            )
          );
        if ((otherOwners[0]?.value ?? 0) < 1) {
          return { outcome: 'last_owner' };
        }
      }

      const rows = await tx
        .update(schema.users)
        .set({ status: UserStatus.DISABLED, erasureRequestedAt: sql`now()`, updatedAt: sql`now()` })
        .where(
          and(
            eq(schema.users.id, memberId),
            eq(schema.users.tenantId, tenantId),
            isNull(schema.users.anonymizedAt)
          )
        )
        .returning({ id: schema.users.id, email: schema.users.email });

      const updated = rows[0];
      if (!updated) {
        return { outcome: 'not_found' };
      }
      return { outcome: 'requested', id: updated.id, email: updated.email };
    });
  }

  /**
   * The GDPR anonymize-in-place primitive both erasure flows (member removal, tenant erasure)
   * purge through — never a hard `DELETE`, since `review_responses.approved_by_user_id`/
   * `rejected_by_user_id`/`created_by_user_id` (`ON DELETE SET NULL`) need this row to survive for
   * the "who approved this reply" accountability trail, and two `RESTRICT` FKs
   * (`review_provider_connections.connected_by_user_id`, `notifications.recipient_user_id`) would
   * outright block a real delete the moment this user has ever connected a location or received a
   * notification.
   *
   * Idempotent — guarded on `anonymized_at IS NULL`, so calling this twice (a retried purge job,
   * a row already caught by an earlier run) is a harmless no-op the second time, not an error.
   * Avatar deletion is NOT this method's job — see `AccountAnonymizationService`, which calls
   * `MediaService.deleteAvatarIfPresent` first and this method second.
   */
  async anonymizeUser(userId: string): Promise<{ outcome: 'already_anonymized' | 'anonymized' }> {
    return this.dbService.db.transaction(async tx => {
      const rows = await tx
        .update(schema.users)
        .set({
          name: null,
          email: null,
          passwordHash: null,
          status: UserStatus.DISABLED,
          anonymizedAt: sql`now()`,
          erasureRequestedAt: null,
          updatedAt: sql`now()`,
        })
        .where(and(eq(schema.users.id, userId), isNull(schema.users.anonymizedAt)))
        .returning({ id: schema.users.id });

      if (!rows[0]) {
        return { outcome: 'already_anonymized' };
      }

      await tx.delete(schema.userIdentities).where(eq(schema.userIdentities.userId, userId));

      return { outcome: 'anonymized' };
    });
  }

  /**
   * Undoes `requestMemberRemoval` — clears the pending marker and restores `status = 'active'`.
   * Scoped to a row that still has `erasure_requested_at` set and hasn't been anonymized yet;
   * once the grace period elapses and the cron job runs, there is nothing left to cancel.
   *
   * Takes a per-member advisory lock (`hashtext('gdpr:member-erasure'), hashtext(memberId)`) —
   * the same key the erasure-purge cron's standalone member-removal loop takes as a session lock
   * (see `runWithErasurePurgeLock`'s `acquireLock` parameter) before anonymizing that user. Without
   * this, this method could "succeed" in the gap between the cron reading its due-user list and
   * actually anonymizing that user, racing to restore access to a user the cron anonymizes anyway
   * moments later — the same class of race `AdminBusinessesRepository.cancelErasure` closes against
   * the cron's tenant-wide loop.
   */
  async cancelMemberRemoval(
    tenantId: string,
    memberId: string
  ): Promise<CancelMemberRemovalOutcome> {
    return this.dbService.db.transaction(async tx => {
      await acquireResourceXactLock(tx, 'gdpr:member-erasure', memberId);

      const rows = await tx
        .update(schema.users)
        .set({ status: UserStatus.ACTIVE, erasureRequestedAt: null, updatedAt: sql`now()` })
        .where(
          and(
            eq(schema.users.id, memberId),
            eq(schema.users.tenantId, tenantId),
            isNotNull(schema.users.erasureRequestedAt),
            isNull(schema.users.anonymizedAt)
          )
        )
        .returning({ id: schema.users.id });

      const updated = rows[0];
      if (updated) {
        return { outcome: 'cancelled', id: updated.id };
      }

      // Scoped off anonymized rows too, matching the CAS update's own guard above — a member the
      // nightly purge already anonymized (row still exists, but is no longer a real active person)
      // reads as "not found" here, not a misleading "not pending" that implies removal simply
      // hasn't started yet. Only reachable via a stale tab, a replayed request, or a direct API
      // call: `listTenantMembers` already excludes anonymized rows, so the normal UI never has
      // this id.
      const existing = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.id, memberId),
            eq(schema.users.tenantId, tenantId),
            isNull(schema.users.anonymizedAt)
          )
        )
        .limit(1);

      return { outcome: existing.length > 0 ? 'not_pending' : 'not_found' };
    });
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

  // ─── GDPR erasure-purge (nightly cron job) ────────────────────────────────

  /** `Date.now() - gracePeriodDays` as the ISO cutoff every due-for-erasure query below compares
   *  against — one place, so `findTenantsDueForErasurePurge`/`isTenantStillDueForErasure` and
   *  `findUsersDueForErasurePurge`/`isUserStillDueForErasure` can never compute it inconsistently
   *  with each other. */
  private erasureCutoff(gracePeriodDays: number): string {
    return new Date(Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000).toISOString();
  }

  /**
   * Shared by `findTenantsDueForErasurePurge` (every due tenant) and `isTenantStillDueForErasure`
   * (one tenant, re-checked under the per-tenant lock) — the exact same "still suspended,
   * erasure_requested_at set and past the cutoff" predicate either way, just optionally narrowed
   * to one id, so the two can never silently drift out of sync with each other.
   */
  private tenantDueForErasureCondition(cutoff: string, tenantId?: string): SQL | undefined {
    const conditions = [
      eq(schema.tenants.status, TenantStatus.SUSPENDED),
      isNotNull(schema.tenants.erasureRequestedAt),
      lte(schema.tenants.erasureRequestedAt, cutoff),
    ];
    if (tenantId !== undefined) {
      conditions.push(eq(schema.tenants.id, tenantId));
    }
    return and(...conditions);
  }

  /** Same shape as `tenantDueForErasureCondition`, for the standalone (non-tenant-wide) member-
   *  removal path — shared by `findUsersDueForErasurePurge` and `isUserStillDueForErasure`. */
  private userDueForErasureCondition(cutoff: string, userId?: string): SQL | undefined {
    const conditions = [
      isNotNull(schema.users.erasureRequestedAt),
      lte(schema.users.erasureRequestedAt, cutoff),
      isNull(schema.users.anonymizedAt),
    ];
    if (userId !== undefined) {
      conditions.push(eq(schema.users.id, userId));
    }
    return and(...conditions);
  }

  /**
   * Tenants whose grace period has elapsed — `erasure_requested_at` set and at least
   * `gracePeriodDays` ago, still `suspended` (not yet flipped to the terminal `erased`, and not a
   * plain suspension with no erasure pending, since that leaves `erasure_requested_at` null).
   */
  async findTenantsDueForErasurePurge(
    gracePeriodDays: number
  ): Promise<{ id: string; name: string }[]> {
    return this.dbService.db
      .select({ id: schema.tenants.id, name: schema.tenants.name })
      .from(schema.tenants)
      .where(this.tenantDueForErasureCondition(this.erasureCutoff(gracePeriodDays)));
  }

  /** Every not-yet-anonymized user in a tenant being erased — what the cron job anonymizes one by
   *  one before flipping the tenant itself to `erased`. */
  async findNonAnonymizedUserIdsForTenant(tenantId: string): Promise<string[]> {
    const rows = await this.dbService.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.tenantId, tenantId), isNull(schema.users.anonymizedAt)));

    return rows.map(row => row.id);
  }

  /**
   * The terminal step of tenant erasure — only reachable after every user in the tenant has
   * already been anonymized (the cron job's own ordering guarantees this, not a DB constraint).
   * Guarded on still being `suspended`, so calling this twice (a retried purge job) is a harmless
   * no-op the second time. Returns the tenant's name for the activity-log entry, or `null` if
   * nothing matched.
   */
  async markTenantErased(tenantId: string): Promise<{ name: string } | null> {
    const rows = await this.dbService.db
      .update(schema.tenants)
      .set({ status: TenantStatus.ERASED, updatedAt: sql`now()` })
      .where(
        and(eq(schema.tenants.id, tenantId), eq(schema.tenants.status, TenantStatus.SUSPENDED))
      )
      .returning({ name: schema.tenants.name });

    return rows[0] ?? null;
  }

  /**
   * Standalone due member removals — a user whose own grace period elapsed independent of any
   * tenant-wide erasure. Run *after* `findTenantsDueForErasurePurge`'s loop in the same cron tick:
   * a user who was also swept up by a tenant-wide erasure already has `anonymized_at` set by then,
   * so this query naturally returns nothing further for them — no explicit tenant-status join
   * needed to avoid double-processing, idempotency already covers it.
   */
  async findUsersDueForErasurePurge(gracePeriodDays: number): Promise<string[]> {
    const rows = await this.dbService.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(this.userDueForErasureCondition(this.erasureCutoff(gracePeriodDays)));

    return rows.map(row => row.id);
  }

  /**
   * Holds a SESSION-level advisory lock (`pg_advisory_lock`, not `_xact_lock`) for `fn`'s entire
   * duration — deliberately not a transaction-scoped lock, since `fn` calls out to
   * `AccountAnonymizationService` (Cloudinary + several independent per-user transactions) and a
   * `_xact_lock` would release after the very first one, letting a second concurrent run (a second
   * replica, an overlapping manual trigger) start double-processing the rest. Checks out its own
   * client from `dbService.pool` rather than going through `dbService.db` — see `DBService.pool`'s
   * own comment for why a session lock's acquire/release must share one physical connection.
   *
   * `fn` is handed an `acquireLock` callback for taking further, narrower session locks — one
   * per due tenant (key `'gdpr:tenant-erasure'`) or due standalone member (key
   * `'gdpr:member-erasure'`) — *on this same connection*, rather than each checking out a second
   * pooled client of its own. Postgres session advisory locks stack: a session can hold several
   * distinct keys at once, each released independently, so nesting a per-resource lock inside the
   * outer purge lock on one connection is safe and avoids doubling pool usage per due
   * tenant/member on every cron tick.
   *
   * Each per-resource key taken through `acquireLock` is the SAME key
   * `AdminBusinessesRepository.cancelErasure`/`setStatus` (for tenants) and
   * `AuthRepository.cancelMemberRemoval` (for members) take as transaction-scoped
   * (`pg_advisory_xact_lock`) locks. A session-level and a transaction-level advisory lock on the
   * same key conflict with each other in Postgres (only their release timing differs), so this
   * mutually excludes the cron's per-tenant/per-member processing against a concurrent admin
   * cancel-erasure/cancel-removal call for that same resource — without it, an admin could cancel
   * while the cron is mid-loop anonymizing that resource, leaving it active with its data already
   * anonymized.
   */
  async runWithErasurePurgeLock<T>(
    fn: (acquireLock: AcquireErasureLock) => Promise<T>
  ): Promise<T> {
    const client = await this.dbService.pool.connect();
    try {
      await client.query(`SELECT pg_advisory_lock(hashtext('gdpr:erasure-purge'), 0)`);
      try {
        const acquireLock: AcquireErasureLock = async (lockKey, resourceId, innerFn) => {
          await client.query(`SELECT pg_advisory_lock(hashtext($1), hashtext($2))`, [
            lockKey,
            resourceId,
          ]);
          try {
            return await innerFn();
          } finally {
            await client.query(`SELECT pg_advisory_unlock(hashtext($1), hashtext($2))`, [
              lockKey,
              resourceId,
            ]);
          }
        };
        return await fn(acquireLock);
      } finally {
        await client.query(`SELECT pg_advisory_unlock(hashtext('gdpr:erasure-purge'), 0)`);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Re-verifies a tenant is still due for erasure from *inside* `acquireLock('gdpr:tenant-erasure',
   * tenantId, ...)` — the cron's `findTenantsDueForErasurePurge` read happens before the lock is
   * acquired, so by the time the lock is held, an admin may have already cancelled the erasure (or,
   * in principle, a previous overlapping run already erased it). Shares
   * `tenantDueForErasureCondition` with `findTenantsDueForErasurePurge`, scoped to one tenant, so
   * the two can never define "still due" differently from each other.
   */
  async isTenantStillDueForErasure(tenantId: string, gracePeriodDays: number): Promise<boolean> {
    const rows = await this.dbService.db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(this.tenantDueForErasureCondition(this.erasureCutoff(gracePeriodDays), tenantId))
      .limit(1);

    return rows.length > 0;
  }

  /**
   * Standalone-member counterpart to `isTenantStillDueForErasure` — re-verifies one user is still
   * due from *inside* `acquireLock('gdpr:member-erasure', userId, ...)`, closing the same TOCTOU
   * race `isTenantStillDueForErasure` closes for tenants: `findUsersDueForErasurePurge`'s read
   * happens before the lock is acquired, so a concurrent `cancelMemberRemoval` for this same user
   * may have already landed by the time the lock is held.
   */
  async isUserStillDueForErasure(userId: string, gracePeriodDays: number): Promise<boolean> {
    const rows = await this.dbService.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(this.userDueForErasureCondition(this.erasureCutoff(gracePeriodDays), userId))
      .limit(1);

    return rows.length > 0;
  }
}
