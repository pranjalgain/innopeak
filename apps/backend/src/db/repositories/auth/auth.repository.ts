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
  ErasureNoticeRecipient,
  ErasureReminderCandidate,
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
 * Every `token_purpose` this codebase mints, i.e. every one the nightly `deleteStaleOtpTokens`
 * sweep must cover; a purpose missing here has spent rows nothing ever deletes. `reset` is absent
 * because nothing writes it yet.
 */
export const PURGEABLE_OTP_PURPOSES = [
  TokenPurpose.VERIFY_EMAIL,
  TokenPurpose.SET_PASSWORD,
  TokenPurpose.INVITE,
] as const;

/**
 * Mechanical Drizzle queries only; composition and transaction ownership belong to AuthDbService.
 * Write methods take the transaction handle explicitly (positional, alongside a named input
 * object).
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Global, deliberately not scoped to a tenant or status: `users.email` is only unique per tenant,
   * so signup's "already registered anywhere" check must see across tenants, and login must find
   * the account whatever its status. Excludes anonymized accounts (their email is free for reuse).
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

    // Drizzle infers pgEnum columns as plain string-literal unions; this is the one place that
    // bridges them to the app enums (the values are identical).
    return (rows[0] as UserByEmail | undefined) ?? null;
  }

  /** Keyed by id for refresh/logout, which only have the JWT `sub`. */
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

  /**
   * Same rule as `GET /v1/connections`' `connected` (live connection and an active location); bare
   * row existence still read a disconnected tenant as connected and bounced them back to
   * onboarding.
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

  /**
   * Null means never chosen, or the chosen location was removed (`ON DELETE SET NULL`);
   * `ConnectionsService.getConnectionStatus` falls back to the first active location either way.
   */
  async findActiveLocationId(tenantId: string): Promise<string | null> {
    const rows = await this.dbService.db
      .select({ activeLocationId: schema.tenants.activeLocationId })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    return rows[0]?.activeLocationId ?? null;
  }

  /**
   * Trusts its input; the caller (`ConnectionsService.setActiveLocation`) restricts this to an
   * owner and validates the location.
   */
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
    // `escalation_rating_threshold` keeps its column default (single source of truth);
    // `auto_post_enabled` is written explicitly because "never post without a human" is an
    // app-level guarantee, not a schema default.
    await tx.insert(schema.tenantSettings).values({
      tenantId: input.tenantId,
      autoPostEnabled: false,
      reviewDataRetentionMonths: null,
    });
  }

  /**
   * Seeds the new owner as the tenant's one escalation recipient; with no `notification_recipients`
   * row every escalation would silently no-op and there is no add-recipient route to fix it later.
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
   * Upserts on `(user_id, purpose)`, not `token_hash`: a verify_email code is a 6-digit OTP, so two
   * users can hold the same digits and the hash cannot identify "this user's live code". The unique
   * index keeps one live row per user per purpose; every reissue overwrites it, which also covers
   * the dev fixed-code bypass.
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
   * Compare-and-swap: the `used_at IS NULL AND expires_at > now()` guard is in the `WHERE` of the
   * consuming `UPDATE`, so of two simultaneous requests for one code the loser matches zero rows.
   * Also scoped by `userId`, since `token_hash` is not unique across users.
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
   * Discards a password that was set but never proven (see `AuthDbService.resolveGoogleIdentity`):
   * an SSO assertion proves only the mailbox, so activating the row would leave a possibly
   * squatter-chosen password live.
   */
  async clearPasswordHash(tx: DrizzleTransaction, userId: string): Promise<void> {
    await tx
      .update(schema.users)
      .set({ passwordHash: null, updatedAt: sql`now()` })
      .where(eq(schema.users.id, userId));
  }

  /**
   * Drops any outstanding verify-email code: it served its purpose, or belonged to a signup attempt
   * that is no longer trusted (see `clearPasswordHash`).
   */
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
   * Same upsert shape as `putVerifyEmailToken`, with its own `set_password` purpose. It is the
   * step-up proof `AuthService.setPassword` requires before a 15-minute access token can create a
   * permanent password; without it a stolen access token sufficed.
   *
   * Deliberately not `reset` (reserved for the public forgot-password route): a shared value would
   * let this upsert invalidate a live reset token and let a code minted here satisfy that
   * unauthenticated consume.
   */
  putSetPasswordOtp(tx: DrizzleTransaction, input: PutVerifyEmailTokenInput): Promise<void> {
    return this.putStepUpOtp(tx, TokenPurpose.SET_PASSWORD, input);
  }

  /** `consumeVerifyEmailToken`'s CAS shape, scoped to the `set_password`-purpose row `putSetPasswordOtp` writes. */
  consumeSetPasswordOtp(
    tx: DrizzleTransaction,
    input: { userId: string; tokenHash: string }
  ): Promise<boolean> {
    return this.consumeStepUpOtp(tx, TokenPurpose.SET_PASSWORD, input);
  }

  /**
   * Step-up code for an SSO-only owner before scheduling their business's erasure; its own
   * `delete_account` purpose so it satisfies neither `set_password` nor the reset route.
   */
  putDeleteAccountOtp(tx: DrizzleTransaction, input: PutVerifyEmailTokenInput): Promise<void> {
    return this.putStepUpOtp(tx, TokenPurpose.DELETE_ACCOUNT, input);
  }

  consumeDeleteAccountOtp(
    tx: DrizzleTransaction,
    input: { userId: string; tokenHash: string }
  ): Promise<boolean> {
    return this.consumeStepUpOtp(tx, TokenPurpose.DELETE_ACCOUNT, input);
  }

  private async putStepUpOtp(
    tx: DrizzleTransaction,
    purpose: TokenPurpose,
    input: PutVerifyEmailTokenInput
  ): Promise<void> {
    await tx
      .insert(schema.passwordResetTokens)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        purpose,
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

  private async consumeStepUpOtp(
    tx: DrizzleTransaction,
    purpose: TokenPurpose,
    input: { userId: string; tokenHash: string }
  ): Promise<boolean> {
    const rows = await tx
      .update(schema.passwordResetTokens)
      .set({ usedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.passwordResetTokens.userId, input.userId),
          eq(schema.passwordResetTokens.tokenHash, input.tokenHash),
          eq(schema.passwordResetTokens.purpose, purpose),
          isNull(schema.passwordResetTokens.usedAt),
          gt(schema.passwordResetTokens.expiresAt, sql`now()`)
        )
      )
      .returning({ id: schema.passwordResetTokens.id });

    return rows.length > 0;
  }

  /**
   * Scoped to `pending_verification` so a stale or reused token cannot reactivate an account in
   * another status. Returns whether anything changed, so a guard-blocked no-op is distinguishable
   * from an activation.
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
   * Moves a tenant off `pending_activation` once the owner's email is proven (OTP, or Google).
   * Scoped to `pending_activation` so it can never undo an admin's suspension.
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
   * Found without filtering on `revoked_at IS NULL`, so a spent token is still found along with
   * when it was spent: that is what makes reuse detection possible ("not active" otherwise merges
   * never existed, expired and rotated out). `revokedAt` lets the caller tell a lost rotation race
   * moments ago from a later replay (see `TokenService.rotate`, `REFRESH_REUSE_GRACE_SECONDS`).
   * Still excludes expired tokens.
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
   * Whether the user has any live session. Separates a refresh token that lost a rotation race (a
   * successor exists and the browser already holds it, so cookies must not be cleared) from one
   * whose whole family is dead (cookies must be cleared). See `AuthController.refresh`.
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
   * Compare-and-swap: the `revoked_at IS NULL` guard is in the `UPDATE`'s `WHERE`, so of N
   * concurrent rotations exactly one sees a row change. `false` means the token was already spent
   * and no replacement may be issued.
   */
  async revokeRefreshToken(tx: DrizzleTransaction, id: string): Promise<boolean> {
    const rows = await tx
      .update(schema.refreshTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(schema.refreshTokens.id, id), isNull(schema.refreshTokens.revokedAt)))
      .returning({ id: schema.refreshTokens.id });

    return rows.length > 0;
  }

  /** Returns the number of rows removed. */
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
   * Expired tokens go immediately; a revoked row is kept for
   * `REFRESH_TOKEN_REVOKED_RETENTION_HOURS` past `revokedAt` because
   * `TokenService.handleSpentToken` needs it to tell a replay from a lost rotation race. Returns
   * the number of rows removed.
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
   * Idempotent on `idx_user_identities_provider_provider_user_id`; a repeat sign-in refreshes the
   * recorded email (Workspace accounts get renamed) instead of raising a 23505.
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
   * SSO counterpart to `insertOwnerUser`: created active and verified, with no password hash. It
   * never passes through `verifyEmail`, so the caller must provision the workspace itself.
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
   * Creates the invited member's `users` row (`status: invited`, no password); the invite token
   * goes into `password_reset_tokens` via `insertMemberInviteToken` in the same transaction.
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

  /**
   * Plain insert, not an upsert: a brand-new `users` row never has a prior invite token to replace.
   */
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
   * Global, not tenant-scoped: `idx_users_email_active` is globally unique, so "already claimed"
   * must be checked across tenants before `TenantMembersService.sendInvite` inserts.
   * `inviteExpiresAt` comes from the left-joined invite token and is `null` for anyone not invited.
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
   * Read-only preview so the accept screen and the Google-authorize route can fail fast on a dead
   * link. The invite row's `used_at`/`expires_at` are the source of truth for "still redeemable",
   * never `users.status` (the accept paths flip both in one transaction).
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

  /** Password variant of invite redemption; the Google variant shares `lockLiveMemberInvite`. */
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
        // Raced with another accept/remove between the lock and this write: the invite row was
        // live, the users row no longer is.
        return { outcome: 'invalid' };
      }

      await this.consumeMemberInvite(tx, invite.id);
      return {
        outcome: 'accepted',
        id: member.id,
        tenantId: member.tenantId,
        // `email`/`name` are nullable at the column level (GDPR anonymize) but provably set here:
        // the row was just `invited` (never anonymized) and `name` was set by this UPDATE.
        email: member.email!,
        name: member.name!,
      };
    });
  }

  /**
   * Google variant of invite redemption; `AuthService.completeMemberInviteGoogle` has already
   * confirmed the verified email matches. A plain insert, not `upsertUserIdentity`: its
   * `onConflictDoUpdate` would silently steal a Google identity linked to a different user instead
   * of reporting `identity_already_linked`.
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
          // This Google account is already linked to a different user; rolls back with the
          // transaction so the member is not left half-activated.
          return { outcome: 'identity_already_linked' };
        }
        throw error;
      }

      await this.consumeMemberInvite(tx, invite.id);
      return {
        outcome: 'accepted',
        id: member.id,
        tenantId: member.tenantId,
        // Provably set: this row was just `invited` (never anonymized) and `name` was set by this
        // UPDATE.
        email: member.email!,
        name: member.name!,
      };
    });
  }

  /**
   * Locks the live (unused, unexpired) invite row so a concurrent redemption cannot also pass;
   * mirrors `PlatformAdminRepository.lockLiveInvite`.
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
   * Deletes the invited member's row outright (never accepted, so no real account), scoped to
   * `status = 'invited'` AND `tenant_id` so an owner cannot revoke another tenant's invite or a
   * member who has accepted. Both statements carry the tenant scope: scoping the token delete by
   * `user_id` alone would let a cross-tenant request delete another tenant's invite token even
   * though the `users` delete then matches nothing and returns 404.
   *
   * The token row is deleted explicitly, before `users`, to match `lockLiveMemberInvite`'s lock
   * order (token, then user); the FK cascade would lock in the opposite order and could deadlock
   * against an in-flight accept. `PlatformAdminRepository.deleteInvitedAdmin` has the same latent
   * risk.
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
        // `email` is nullable (GDPR anonymize) but this row was still `invited`, which is never
        // anonymized, so it is the invited address.
        return { outcome: 'revoked' as const, email: deleted.email! };
      }

      // Nothing matched: no such id in this tenant, or the row is no longer `invited` (the delete
      // above harmlessly removed its spent token). The extra read runs only on this failure path.
      const existing = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.id, memberId), eq(schema.users.tenantId, tenantId)))
        .limit(1);

      return { outcome: existing.length > 0 ? ('not_invited' as const) : ('not_found' as const) };
    });
  }

  /**
   * Drops a lapsed invite so the address can be invited again (a stale row otherwise claims it
   * forever via the global `idx_users_email_active`). Scoped to `invited` so an accepted member is
   * never removed by an invite path; global, since the row was found via the global lookup.
   *
   * Same token-then-user lock order as `deleteInvitedMember`; the window is narrower here but
   * depends on app and DB clocks agreeing on the expiry instant, which is not worth resting a
   * deadlock on.
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
   * Every non-anonymized user in a tenant, oldest first so the owner (created first) leads the Team
   * Members list.
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
   * Marks an active member `disabled` with `erasure_requested_at = now()`: access ends at once, but
   * anonymization is deferred to the nightly purge after `ERASURE_GRACE_PERIOD_DAYS` so a mistaken
   * request can be cancelled. Self-removal is refused a layer up, so the target is never the acting
   * owner.
   *
   * Advisory-locked so two concurrent requests removing the last two owners cannot both read "one
   * other owner exists". The second key is `hashtext(tenantId)` because this invariant is per
   * tenant (unlike the global platform-admin guard it mirrors), so unrelated tenants must not
   * serialize; same key shape as `ConnectionsRepository.acquireLocationConfirmLock`.
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
   * The GDPR anonymize-in-place primitive both erasure flows use, never a hard `DELETE`:
   * `review_responses.*_by_user_id` need the row to survive for the approval trail, and two
   * `RESTRICT` FKs (`review_provider_connections.connected_by_user_id`,
   * `notifications.recipient_user_id`) would block a real delete. Idempotent via `anonymized_at IS
   * NULL`, so a retried purge is a no-op. Avatar deletion is the caller's job
   * (`AccountAnonymizationService`), done first.
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
      // An anonymized user must not keep a way back in: drop every refresh-token hash and
      // unconsumed OTP/invite/reset token (access tokens are stateless and lapse within
      // `ACCESS_TOKEN_TTL_SECONDS`).
      await tx.delete(schema.refreshTokens).where(eq(schema.refreshTokens.userId, userId));
      await tx
        .delete(schema.passwordResetTokens)
        .where(eq(schema.passwordResetTokens.userId, userId));

      return { outcome: 'anonymized' };
    });
  }

  /**
   * Undoes `requestMemberRemoval`, restoring the prior status (`active`, or `invited` for someone
   * who never accepted); only while `erasure_requested_at` is set and the row is not anonymized.
   *
   * Takes the per-member advisory lock the purge cron's member-removal loop also takes, so this
   * cannot "succeed" in the gap between the cron reading its due list and anonymizing that user
   * (the same race `AdminBusinessesRepository.cancelErasure` closes for tenants).
   */
  async cancelMemberRemoval(
    tenantId: string,
    memberId: string
  ): Promise<CancelMemberRemovalOutcome> {
    return this.dbService.db.transaction(async tx => {
      await acquireResourceXactLock(tx, 'gdpr:member-erasure', memberId);

      const rows = await tx
        .update(schema.users)
        .set({
          // Restores the pre-removal status: accepting an invite always stamps `email_verified_at`,
          // so null means never accepted; hard-coding `active` would promote an unaccepted invitee
          // to a member that could no longer be revoked.
          status: sql`CASE WHEN ${schema.users.emailVerifiedAt} IS NULL THEN ${UserStatus.INVITED} ELSE ${UserStatus.ACTIVE} END::user_status`,
          erasureRequestedAt: null,
          updatedAt: sql`now()`,
        })
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

      // Also excludes anonymized rows, like the CAS update above, so a member the purge already
      // anonymized reads as "not found" rather than a misleading "not pending" (reachable only via
      // a stale tab or direct API call).
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
   * Keeps the raw `DBService` connection inside the Repository; AuthDbService composes transactions
   * through this passthrough.
   */
  async transaction<T>(fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(fn);
  }

  /**
   * One place for the ISO cutoff every due-for-erasure query compares against, so the tenant and
   * user variants cannot compute it inconsistently.
   */
  private erasureCutoff(gracePeriodDays: number): string {
    return new Date(Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000).toISOString();
  }

  /**
   * Shared by `findTenantsDueForErasurePurge` and `isTenantStillDueForErasure` (optionally narrowed
   * to one id) so the "still suspended, erasure requested and past the cutoff" predicate cannot
   * drift.
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

  /** Same shape as `tenantDueForErasureCondition`, for the standalone member-removal path. */
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
   * Suspended tenants with `erasure_requested_at` at least `gracePeriodDays` ago; a plain
   * suspension has it null and is excluded.
   */
  async findTenantsDueForErasurePurge(
    gracePeriodDays: number
  ): Promise<{ id: string; name: string; erasureRequestedAt: string | null }[]> {
    return this.dbService.db
      .select({
        id: schema.tenants.id,
        name: schema.tenants.name,
        erasureRequestedAt: schema.tenants.erasureRequestedAt,
      })
      .from(schema.tenants)
      .where(this.tenantDueForErasureCondition(this.erasureCutoff(gracePeriodDays)));
  }

  /** Anonymized one by one by the cron before the tenant itself flips to `erased`. */
  async findNonAnonymizedUserIdsForTenant(tenantId: string): Promise<string[]> {
    const rows = await this.dbService.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.tenantId, tenantId), isNull(schema.users.anonymizedAt)));

    return rows.map(row => row.id);
  }

  /**
   * Active owners with an address: not members, nor anyone disabled, anonymized or pending removal.
   * Read before the purge anonymizes them.
   */
  async findTenantOwnerRecipients(tenantId: string): Promise<ErasureNoticeRecipient[]> {
    return this.dbService.db
      .select({
        userId: schema.users.id,
        hasPassword: sql<boolean>`${schema.users.passwordHash} IS NOT NULL`,
        email: schema.users.email,
        name: schema.users.name,
        locale: schema.users.locale,
      })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.tenantId, tenantId),
          eq(schema.users.role, UserRole.OWNER),
          eq(schema.users.status, UserStatus.ACTIVE),
          isNull(schema.users.anonymizedAt),
          isNull(schema.users.erasureRequestedAt),
          isNotNull(schema.users.email)
        )
      ) as Promise<ErasureNoticeRecipient[]>;
  }

  /**
   * Suspended tenants whose deadline is within `reminderDaysBefore` days but not yet past (those
   * belong to the purge) and not yet reminded.
   */
  async findTenantsDueForErasureReminder(input: {
    gracePeriodDays: number;
    reminderDaysBefore: number;
  }): Promise<ErasureReminderCandidate[]> {
    const day = 24 * 60 * 60 * 1000;
    const windowOpens = new Date(
      Date.now() - (input.gracePeriodDays - input.reminderDaysBefore) * day
    ).toISOString();
    const deadline = this.erasureCutoff(input.gracePeriodDays);

    return this.dbService.db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(
        and(
          eq(schema.tenants.status, TenantStatus.SUSPENDED),
          isNotNull(schema.tenants.erasureRequestedAt),
          lte(schema.tenants.erasureRequestedAt, windowOpens),
          gt(schema.tenants.erasureRequestedAt, deadline),
          isNull(schema.tenants.erasureReminderSentAt)
        )
      );
  }

  /**
   * True only for the caller whose `UPDATE` flips `erasure_reminder_sent_at` from NULL, so
   * overlapping runs cannot both send. Claimed before the email is queued: a failed enqueue loses
   * the reminder rather than risk two.
   */
  async claimErasureReminder(
    tenantId: string
  ): Promise<{ name: string; erasureRequestedAt: string } | null> {
    const rows = await this.dbService.db
      .update(schema.tenants)
      .set({ erasureReminderSentAt: sql`now()` })
      .where(
        and(
          eq(schema.tenants.id, tenantId),
          eq(schema.tenants.status, TenantStatus.SUSPENDED),
          isNotNull(schema.tenants.erasureRequestedAt),
          isNull(schema.tenants.erasureReminderSentAt)
        )
      )
      .returning({
        name: schema.tenants.name,
        erasureRequestedAt: schema.tenants.erasureRequestedAt,
      });

    const row = rows[0];
    return row?.erasureRequestedAt
      ? { name: row.name, erasureRequestedAt: row.erasureRequestedAt }
      : null;
  }

  /**
   * The owner's own erasure request (an admin's is `AdminBusinessesRepository.requestErasure`),
   * plus who asked. Takes the same per-tenant advisory lock as the purge and `cancelErasure`; only
   * an `active` or `pending_activation` tenant qualifies. Returns the tenant's name, or null when
   * nothing was updated.
   */
  async requestTenantErasureBySelf(input: {
    tenantId: string;
    requestedByUserId: string;
  }): Promise<{ name: string } | null> {
    return this.dbService.db.transaction(async tx => {
      await acquireResourceXactLock(tx, 'gdpr:tenant-erasure', input.tenantId);

      const rows = await tx
        .update(schema.tenants)
        .set({
          status: TenantStatus.SUSPENDED,
          erasureRequestedAt: sql`now()`,
          erasureRequestedByUserId: input.requestedByUserId,
          erasureReminderSentAt: null,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(schema.tenants.id, input.tenantId),
            inArray(schema.tenants.status, [TenantStatus.ACTIVE, TenantStatus.PENDING_ACTIVATION])
          )
        )
        .returning({ name: schema.tenants.name });

      return rows[0] ?? null;
    });
  }

  /**
   * Undoes `requestTenantErasureBySelf` and only that: the erasure must be pending and requested by
   * this very user, so an admin's request (column NULL) or another owner's can never be undone
   * here. Takes the same lock as the purge, so a restore cannot succeed in the gap between the
   * purge reading its due list and anonymizing. Returns the tenant's name, or null.
   */
  async cancelSelfRequestedErasure(input: {
    tenantId: string;
    requestedByUserId: string;
    gracePeriodDays: number;
  }): Promise<{ name: string } | null> {
    return this.dbService.db.transaction(async tx => {
      await acquireResourceXactLock(tx, 'gdpr:tenant-erasure', input.tenantId);

      const rows = await tx
        .update(schema.tenants)
        .set({
          status: TenantStatus.ACTIVE,
          erasureRequestedAt: null,
          erasureRequestedByUserId: null,
          erasureReminderSentAt: null,
          lastErasureRequestedAt: sql`${schema.tenants.erasureRequestedAt}`,
          lastErasureCancelledAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(schema.tenants.id, input.tenantId),
            eq(schema.tenants.status, TenantStatus.SUSPENDED),
            isNotNull(schema.tenants.erasureRequestedAt),
            eq(schema.tenants.erasureRequestedByUserId, input.requestedByUserId),
            // Only before the deadline: after it the purge may already have released Stripe, Google
            // and reviewer names, and restoring would revive a half-erased business.
            gt(schema.tenants.erasureRequestedAt, this.erasureCutoff(input.gracePeriodDays))
          )
        )
        .returning({ name: schema.tenants.name });

      return rows[0] ?? null;
    });
  }

  /**
   * What `login` needs to tell a self-requested pending erasure from a plain suspension; only read
   * after the password is proven.
   */
  async findTenantErasureState(tenantId: string): Promise<{
    status: TenantStatus;
    name: string;
    erasureRequestedAt: string | null;
    erasureRequestedByUserId: string | null;
  } | null> {
    const rows = await this.dbService.db
      .select({
        status: schema.tenants.status,
        name: schema.tenants.name,
        erasureRequestedAt: schema.tenants.erasureRequestedAt,
        erasureRequestedByUserId: schema.tenants.erasureRequestedByUserId,
      })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    const row = rows[0];
    return row ? { ...row, status: row.status as TenantStatus } : null;
  }

  /**
   * Terminal step of tenant erasure, only valid once every user in the tenant is anonymized (the
   * cron's ordering guarantees it, not a DB constraint). Guarded on still being `suspended`, so a
   * retried purge is a no-op. Returns the tenant's name for the activity log, or `null` if nothing
   * matched.
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
   * Standalone due member removals, independent of any tenant-wide erasure. Runs after the tenant
   * loop in the same cron tick; users already swept by a tenant erasure have `anonymized_at` set,
   * so idempotency avoids double-processing without a tenant-status join.
   */
  async findUsersDueForErasurePurge(gracePeriodDays: number): Promise<string[]> {
    const rows = await this.dbService.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(this.userDueForErasureCondition(this.erasureCutoff(gracePeriodDays)));

    return rows.map(row => row.id);
  }

  /**
   * Holds a SESSION-level advisory lock (`pg_advisory_lock`, not `_xact_lock`) for `fn`'s whole
   * duration: `fn` calls out to `AccountAnonymizationService` (Cloudinary plus several per-user
   * transactions), and a transaction lock would release after the first, letting a second
   * concurrent run (another replica, an overlapping manual trigger) double-process the rest. Uses
   * its own client from `dbService.pool` because a session lock's acquire and release must share
   * one physical connection (see `DBService.pool`).
   *
   * `fn` gets an `acquireLock` callback for narrower per-tenant (`'gdpr:tenant-erasure'`) or
   * per-member (`'gdpr:member-erasure'`) session locks on this same connection; session advisory
   * locks stack, so this avoids a second pooled client per due resource.
   *
   * Those per-resource keys are the SAME ones `AdminBusinessesRepository.cancelErasure`/`setStatus`
   * and `AuthRepository.cancelMemberRemoval` take as `pg_advisory_xact_lock`. Session and
   * transaction advisory locks on one key conflict, so an admin cancel cannot land while the cron
   * is mid-anonymization, which would leave the resource active with its data already anonymized.
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
   * Re-verifies a tenant is still due from inside `acquireLock('gdpr:tenant-erasure', ...)`: the
   * cron's `findTenantsDueForErasurePurge` read happens before the lock, so an admin may have
   * cancelled (or an overlapping run erased it) meanwhile. Shares `tenantDueForErasureCondition` so
   * "still due" cannot be defined differently.
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
   * Standalone-member counterpart to `isTenantStillDueForErasure`; closes the same TOCTOU race,
   * where a `cancelMemberRemoval` lands between `findUsersDueForErasurePurge` and taking the lock.
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
