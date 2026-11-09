import {
  PENDING_SIGNUP_PURGE_AFTER_HOURS,
  PENDING_SIGNUP_REPLACEABLE_AFTER_HOURS,
} from '@auth/constants/auth.constants';
import { IDENTITY_PROVIDER_FOR, SsoProvider } from '@auth/constants/sso-auth.constants';
import { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { type DrizzleTransaction } from '@db/db.service';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { Injectable } from '@nestjs/common';

import { AuthRepository } from './auth.repository';
import type {
  AcceptMemberInviteOutcome,
  AcquireErasureLock,
  CancelMemberRemovalOutcome,
  ErasureNoticeRecipient,
  ErasureReminderCandidate,
  InsertRefreshTokenInput,
  MemberInviteStatusRow,
  PurgeStaleTokensResult,
  PutVerifyEmailTokenInput,
  RefreshTokenRow,
  RequestMemberRemovalOutcome,
  RevokeMemberInviteOutcome,
  SetActiveLocationIdInput,
  SignupInput,
  SignupResult,
  SsoEmailLinkResult,
  SsoIdentityLookup,
  TenantMemberRow,
  TenantRow,
  UpdateLocaleInput,
  UpdatePasswordInput,
  UserByEmail,
  UserTokenHashInput,
  VerifiedUser,
  VerifyEmailInput,
} from './types/auth.type';

import { AdminOverviewDbService } from '../admin-overview/admin-overview.db-service';
import { TenantSubscriptionsDbService } from '../billing/tenant-subscriptions.db-service';
import { PromptsDbService } from '../prompts/prompts.db-service';

/** Index name Postgres reports as `constraint` on the 23505 a losing concurrent signup raises — see 0002_tenant_auth.sql. */
const USERS_EMAIL_ACTIVE_INDEX = 'idx_users_email_active';

/** Owns every auth transaction so AuthService/TokenService never touch AuthRepository; some methods are thin pass-throughs to keep that invariant without exception. */
@Injectable()
export class AuthDbService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly promptsDbService: PromptsDbService,
    private readonly tenantSubscriptionsDbService: TenantSubscriptionsDbService,
    private readonly adminOverviewDbService: AdminOverviewDbService
  ) {}

  /**
   * "A new business joined" for the platform activity feed, written once the signup is a real, active business (not at the unverified
   * signup, which may never complete). Best-effort and after the activating transaction: a failed log entry must never fail or undo
   * someone's signup. The actor is the owner themselves, since no platform admin did anything.
   */
  private async recordBusinessJoined(input: {
    tenantId: string;
    businessName: string;
    ownerEmail: string;
  }): Promise<void> {
    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.BUSINESS_JOINED,
      actorPlatformAdminId: null,
      actorEmail: input.ownerEmail,
      tenantId: input.tenantId,
      businessName: input.businessName,
    });
  }

  private async recordBusinessJoinedForTenant(tenantId: string, ownerEmail: string): Promise<void> {
    const tenant = await this.authRepository.findTenantStatusById(tenantId);
    // Skipped, not thrown, when the tenant cannot be read: the log entry is a courtesy to the platform feed, never a reason to fail a signup.
    if (tenant) {
      await this.recordBusinessJoined({ tenantId, businessName: tenant.name, ownerEmail });
    }
  }

  /**
   * Returns null when the email is already registered (caller maps it to a 409). The
   * `findUserByEmail` pre-check is only the cheap path; the real guarantee is the partial unique
   * index `idx_users_email_active`: of concurrent signups for one email exactly one
   * `insertOwnerUser` commits, and the loser's unique violation rolls back its tenant + settings
   * and is reported as null.
   */
  async signup(input: SignupInput): Promise<SignupResult | null> {
    const existing = await this.authRepository.findUserByEmail(input.email);
    // An address with a verified account is taken. One with an unverified sign-up is only held for a day: whoever started it may not own
    // the mailbox, so a newer sign-up for it replaces the stale one rather than being refused for good.
    if (existing && existing.status !== UserStatus.PENDING_VERIFICATION) {
      return null;
    }

    const tokenExpiresAt = input.tokenExpiresAt.toISOString();
    try {
      return await this.authRepository.transaction(async tx => {
        if (existing) {
          const replaced = await this.authRepository.deleteStalePendingSignup(tx, {
            userId: existing.id,
            tenantId: existing.tenantId,
            olderThanHours: PENDING_SIGNUP_REPLACEABLE_AFTER_HOURS,
          });
          if (!replaced) {
            return null;
          }
        }

        const tenant = await this.authRepository.insertTenant(tx, { name: input.businessName });
        const user = await this.authRepository.insertOwnerUser(tx, {
          tenantId: tenant.id,
          name: input.ownerName,
          email: input.email,
          passwordHash: input.passwordHash,
        });
        await this.authRepository.insertTenantSettings(tx, { tenantId: tenant.id });
        // A tenant must never be observable without a subscription row, so create it in the same
        // transaction (both signup paths need this).
        await this.tenantSubscriptionsDbService.insertFreeSubscription(tx, tenant.id);
        await this.authRepository.insertNotificationRecipient(tx, {
          tenantId: tenant.id,
          userId: user.id,
        });
        await this.authRepository.putVerifyEmailToken(tx, {
          userId: user.id,
          tokenHash: input.tokenHash,
          expiresAt: tokenExpiresAt,
        });

        return {
          tenantId: tenant.id,
          userId: user.id,
          status: UserStatus.PENDING_VERIFICATION,
          ownerName: input.ownerName,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error, USERS_EMAIL_ACTIVE_INDEX)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Everything a tenant needs before its dashboard is usable; call it when the tenant becomes real
   * (email verification, or any already-verified SSO signup path).
   *
   * Not done at signup: a `pending_verification` tenant may never activate and would leave prompt
   * rows behind. Idempotent, since `insertDefaultsForTenant` conflicts away on
   * `(tenant_id, category)` and every user of a tenant verifying reaches this path.
   */
  private async provisionTenantWorkspace(tx: DrizzleTransaction, tenantId: string): Promise<void> {
    await this.promptsDbService.insertDefaultsForTenant(tx, tenantId);
  }

  /**
   * Resolves a Google identity by `sub` alone (the returning-user case); a pure read.
   *
   * Split from `linkSsoIdentityByEmail` because that one writes, and which accounts may reach it
   * is a security decision the caller must make in between (see `AuthService.handleGoogleCallback`).
   * `{ kind: 'unknown' }` means no tenant identity exists; what that implies depends on intent,
   * which this service does not decide.
   */
  async findSsoIdentityBySub(
    provider: SsoProvider,
    providerUserId: string
  ): Promise<SsoIdentityLookup> {
    const existingIdentity = await this.authRepository.findUserIdByIdentity(
      IDENTITY_PROVIDER_FOR[provider],
      providerUserId
    );

    if (!existingIdentity) {
      return { kind: 'unknown' };
    }

    const user = await this.authRepository.findUserById(existingIdentity.userId);
    // Unreachable in practice (nothing hard-deletes a user); treated as never seen.
    return user === null
      ? { kind: 'unknown' }
      : // An existing identity link is always a returning user, never a first activation.
        { kind: 'known', user: this.toVerifiedUser(user), firstActivation: false };
  }

  /**
   * Links the Google identity to the `users` row already holding that address (signed up with a
   * password, now using Google).
   *
   * This writes: it upserts a `user_identities` row and, for a `pending_verification` account,
   * activates the user and tenant, clears the password hash and provisions the workspace. It
   * matches on email, which nothing proves before the OTP, so the caller must only reach it with an address the provider itself
   * verified (`AuthService` refuses an unverified one before calling it). It never consults platform admins: an admin and a tenant user
   * may share an address, and the admin console has its own sign-in entries.
   */
  async linkSsoIdentityByEmail(input: {
    provider: SsoProvider;
    providerUserId: string;
    email: string;
  }): Promise<SsoEmailLinkResult> {
    const byEmail = await this.authRepository.findUserByEmail(input.email);
    // An invitee has no identity, password or verified address yet: signing them in here would skip the invite's plan-limit check
    // and leave a live session on a row that revoking or re-sending the invite deletes. Only the invite link accepts it.
    if (byEmail?.status === UserStatus.INVITED) {
      return { kind: 'invited' };
    }
    if (byEmail) {
      // Google verified the address, so linking also finishes a signup stalled at the OTP screen
      // (otherwise it stays pending_verification forever).
      const activated = await this.authRepository.transaction(async tx => {
        await this.authRepository.upsertUserIdentity(tx, {
          userId: byEmail.id,
          provider: IDENTITY_PROVIDER_FOR[input.provider],
          providerUserId: input.providerUserId,
          email: input.email,
        });

        if (byEmail.status !== UserStatus.PENDING_VERIFICATION) {
          return false;
        }

        const promoted = await this.authRepository.activateUser(tx, byEmail.id);
        if (promoted) {
          // Pre-hijack defence: a pending_verification password was typed by whoever ran signup, and
          // nothing proves they own the mailbox. Google proves the mailbox, not the password, so
          // keeping it would give a squatter permanent password access to the victim's tenant. Drop it
          // with its outstanding code; the account adopts its own via POST /v1/auth/set-password.
          await this.authRepository.clearPasswordHash(tx, byEmail.id);
          await this.authRepository.deleteVerifyEmailTokensForUser(tx, byEmail.id);

          await this.authRepository.activateTenant(tx, byEmail.tenantId);
          // This account never reaches `verifyEmail`, so provision here or the tenant has no prompts.
          await this.provisionTenantWorkspace(tx, byEmail.tenantId);
        }
        return promoted;
      });

      if (activated) {
        await this.recordBusinessJoinedForTenant(byEmail.tenantId, byEmail.email);
      }

      return {
        kind: 'known',
        user: this.toVerifiedUser(
          activated ? { ...byEmail, status: UserStatus.ACTIVE, passwordHash: null } : byEmail
        ),
        firstActivation: activated,
      };
    }

    return { kind: 'unknown' };
  }

  /**
   * Second half of a deferred Google signup, once a business name is collected: tenant + owner +
   * settings + identity + prompts in one transaction. The owner is created active and verified, so
   * it provisions its own workspace here (it never reaches `verifyEmail`).
   *
   * Returns null on the same race `signup` guards against (email registered between the OAuth
   * callback and this call); the caller reports a conflict rather than a 500.
   */
  async completeSsoSignup(input: {
    provider: SsoProvider;
    providerUserId: string;
    email: string;
    name: string | null;
    businessName: string;
  }): Promise<VerifiedUser | null> {
    const ownerName = input.name ?? input.email;

    let created: VerifiedUser;
    try {
      created = await this.authRepository.transaction(async tx => {
        const tenant = await this.authRepository.insertTenant(tx, { name: input.businessName });
        const user = await this.authRepository.insertVerifiedOwnerUser(tx, {
          tenantId: tenant.id,
          name: ownerName,
          email: input.email,
        });
        await this.authRepository.insertTenantSettings(tx, { tenantId: tenant.id });
        // A tenant must never be observable without a subscription row, so create it in the same
        // transaction (both signup paths need this).
        await this.tenantSubscriptionsDbService.insertFreeSubscription(tx, tenant.id);
        await this.authRepository.insertNotificationRecipient(tx, {
          tenantId: tenant.id,
          userId: user.id,
        });
        await this.authRepository.upsertUserIdentity(tx, {
          userId: user.id,
          provider: IDENTITY_PROVIDER_FOR[input.provider],
          providerUserId: input.providerUserId,
          email: input.email,
        });
        // Google already verified the owner's email, so activate on the spot.
        await this.authRepository.activateTenant(tx, tenant.id);
        await this.provisionTenantWorkspace(tx, tenant.id);

        return {
          id: user.id,
          tenantId: tenant.id,
          email: input.email,
          name: ownerName,
          role: UserRole.OWNER,
          passwordHash: null,
          status: UserStatus.ACTIVE,
          locale: null,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error, USERS_EMAIL_ACTIVE_INDEX)) {
        return null;
      }
      throw error;
    }

    await this.recordBusinessJoined({
      tenantId: created.tenantId,
      businessName: input.businessName,
      ownerEmail: input.email,
    });
    return created;
  }

  private toVerifiedUser(user: UserByEmail): VerifiedUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
      passwordHash: user.passwordHash,
      status: user.status,
      locale: user.locale,
    };
  }

  /** Issues (or reissues) a verify_email code for an already-existing user — signup's resumable path, login's pending-verification path, and an explicit resend all go through this. */
  async putVerifyEmailToken(input: PutVerifyEmailTokenInput): Promise<void> {
    const { userId, tokenHash, expiresAt } = input;
    await this.authRepository.transaction(tx =>
      this.authRepository.putVerifyEmailToken(tx, { userId, tokenHash, expiresAt })
    );
  }

  /** Issues (or reissues) the OTP `AuthService.setPassword` requires before a passwordless account can adopt one — see `AuthRepository.putSetPasswordOtp`. */
  async putSetPasswordOtp(input: PutVerifyEmailTokenInput): Promise<void> {
    const { userId, tokenHash, expiresAt } = input;
    await this.authRepository.transaction(tx =>
      this.authRepository.putSetPasswordOtp(tx, { userId, tokenHash, expiresAt })
    );
  }

  /** CAS-consumes the set-password OTP; true only if it matched, was unused, and hadn't expired. */
  async consumeSetPasswordOtp(input: UserTokenHashInput): Promise<boolean> {
    const { userId, tokenHash } = input;
    return this.authRepository.transaction(tx =>
      this.authRepository.consumeSetPasswordOtp(tx, { userId, tokenHash })
    );
  }

  /** The step-up code an SSO-only owner clears before scheduling their own business's erasure — see `AuthRepository.putDeleteAccountOtp`. */
  async putDeleteAccountOtp(input: PutVerifyEmailTokenInput): Promise<void> {
    const { userId, tokenHash, expiresAt } = input;
    await this.authRepository.transaction(tx =>
      this.authRepository.putDeleteAccountOtp(tx, { userId, tokenHash, expiresAt })
    );
  }

  /** CAS-consumes the delete-account OTP; true only if it matched, was unused, and hadn't expired. */
  async consumeDeleteAccountOtp(input: UserTokenHashInput): Promise<boolean> {
    const { userId, tokenHash } = input;
    return this.authRepository.transaction(tx =>
      this.authRepository.consumeDeleteAccountOtp(tx, { userId, tokenHash })
    );
  }

  requestTenantErasureBySelf(input: {
    tenantId: string;
    requestedByUserId: string;
  }): Promise<{ name: string } | null> {
    return this.authRepository.requestTenantErasureBySelf(input);
  }

  cancelSelfRequestedErasure(input: {
    tenantId: string;
    requestedByUserId: string;
    gracePeriodDays: number;
  }): Promise<{ name: string } | null> {
    return this.authRepository.cancelSelfRequestedErasure(input);
  }

  findTenantErasureState(tenantId: string): ReturnType<AuthRepository['findTenantErasureState']> {
    return this.authRepository.findTenantErasureState(tenantId);
  }

  /**
   * Returns null for a wrong, used or expired code, or a non-`pending_verification` account; the
   * caller maps every case to the uniform INVALID_OR_EXPIRED_OTP so they stay indistinguishable.
   */
  async verifyEmail(input: VerifyEmailInput): Promise<VerifiedUser | null> {
    const { email, tokenHash } = input;
    const user = await this.authRepository.findUserByEmail(email);
    if (user?.status !== UserStatus.PENDING_VERIFICATION) {
      return null;
    }

    const verified = await this.authRepository.transaction(async tx => {
      const consumed = await this.authRepository.consumeVerifyEmailToken(tx, {
        userId: user.id,
        tokenHash,
      });
      if (!consumed) {
        return null;
      }

      const activated = await this.authRepository.activateUser(tx, user.id);
      if (!activated) {
        return null;
      }

      // The proven email is what `tenants.status` tracks; nothing else moves it off `pending_activation`.
      await this.authRepository.activateTenant(tx, user.tenantId);
      await this.provisionTenantWorkspace(tx, user.tenantId);

      return {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash: user.passwordHash,
        status: UserStatus.ACTIVE,
        locale: user.locale,
      };
    });

    if (verified !== null) {
      await this.recordBusinessJoinedForTenant(verified.tenantId, verified.email);
    }
    return verified;
  }

  async findUserForLogin(email: string): Promise<UserByEmail | null> {
    return this.authRepository.findUserByEmail(email);
  }

  async findUserById(id: string): Promise<UserByEmail | null> {
    return this.authRepository.findUserById(id);
  }

  async findTenantStatus(tenantId: string): Promise<TenantRow | null> {
    return this.authRepository.findTenantStatusById(tenantId);
  }

  async hasConnectedBusiness(tenantId: string): Promise<boolean> {
    return this.authRepository.hasConnectedBusiness(tenantId);
  }

  async insertRefreshToken(input: InsertRefreshTokenInput): Promise<void> {
    const { userId, tokenHash, expiresAt } = input;
    await this.authRepository.transaction(tx =>
      this.authRepository.insertRefreshToken(tx, { userId, tokenHash, expiresAt })
    );
  }

  /** Includes already-revoked rows so reuse of a spent token is distinguishable from one that never existed. */
  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    return this.authRepository.findRefreshTokenByHash(tokenHash);
  }

  /** Distinguishes a lost rotation race from a dead session. */
  async hasActiveRefreshToken(userId: string): Promise<boolean> {
    return this.authRepository.hasActiveRefreshToken(userId);
  }

  /**
   * Revoke and persist the replacement atomically, only if the revoke flipped the row. Returns
   * false when the token was already spent (concurrent rotation or replay) so the caller can reject.
   */
  async rotateRefreshToken(
    revokeId: string,
    replacement: { userId: string; tokenHash: string; expiresAt: string }
  ): Promise<boolean> {
    return this.authRepository.transaction(async tx => {
      const revoked = await this.authRepository.revokeRefreshToken(tx, revokeId);
      if (!revoked) {
        return false;
      }

      await this.authRepository.insertRefreshToken(tx, replacement);
      return true;
    });
  }

  async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    await this.authRepository.transaction(tx =>
      this.authRepository.revokeAllRefreshTokensForUser(tx, userId)
    );
  }

  /** Hash write and revoke-all-sessions in one transaction, so a crash cannot leave the old password live. */
  async updatePasswordAndRevokeSessions(input: UpdatePasswordInput): Promise<void> {
    const { userId, passwordHash } = input;
    await this.authRepository.transaction(async tx => {
      await this.authRepository.updatePasswordHash(tx, { userId, passwordHash });
      await this.authRepository.revokeAllRefreshTokensForUser(tx, userId);
    });
  }

  /** No session revoke — unlike a password change, a locale is not a security boundary. */
  async updateLocale(input: UpdateLocaleInput): Promise<void> {
    const { userId, locale } = input;
    await this.authRepository.transaction(tx =>
      this.authRepository.updateLocale(tx, { userId, locale })
    );
  }

  /** Null means never chosen, or the chosen location was later removed. */
  findActiveLocationId(tenantId: string): Promise<string | null> {
    return this.authRepository.findActiveLocationId(tenantId);
  }

  async setActiveLocationId(input: SetActiveLocationIdInput): Promise<void> {
    const { tenantId, locationId } = input;
    await this.authRepository.transaction(tx =>
      this.authRepository.updateActiveLocationId(tx, { tenantId, locationId })
    );
  }

  /** Daily housekeeping (CronJobName.AUTH_TOKEN_CLEANUP): drops used/expired OTP codes (verify_email and set_password), revoked/expired refresh tokens and sign-ups nobody verified within a week. */
  async purgeStaleTokens(): Promise<PurgeStaleTokensResult> {
    return this.authRepository.transaction(async tx => ({
      otpTokens: await this.authRepository.deleteStaleOtpTokens(tx),
      refreshTokens: await this.authRepository.deleteStaleRefreshTokens(tx),
      pendingSignups: await this.authRepository.deleteStalePendingSignups(
        tx,
        PENDING_SIGNUP_PURGE_AFTER_HOURS
      ),
    }));
  }

  /** The global check `TenantMembersService.sendInvite` runs before attempting the insert. */
  async findMemberInviteStatusByEmail(email: string): Promise<MemberInviteStatusRow | null> {
    return this.authRepository.findMemberInviteStatusByEmail(email);
  }

  /** Lets the same address be invited again once an invite has lapsed. */
  async deleteExpiredMemberInvite(id: string): Promise<void> {
    await this.authRepository.deleteExpiredMemberInvite(id);
  }

  /**
   * Creates the invited member's `users` row and invite token in one transaction; the returned row
   * is built from the inputs rather than re-read (as in `PlatformAdminDbService.createInvite`).
   */
  async createMemberInvite(input: {
    tenantId: string;
    invitedByUserId: string;
    email: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<TenantMemberRow> {
    const inserted = await this.authRepository.transaction(async tx => {
      const user = await this.authRepository.insertInvitedMember(tx, {
        tenantId: input.tenantId,
        email: input.email,
        // `users.name` is NOT NULL; the invitee picks their own on the accept screen.
        name: input.email,
        invitedByUserId: input.invitedByUserId,
      });
      await this.authRepository.insertMemberInviteToken(tx, {
        userId: user.id,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      });
      return user;
    });

    return {
      id: inserted.id,
      name: input.email,
      email: input.email,
      role: UserRole.MEMBER,
      status: UserStatus.INVITED,
      erasureRequestedAt: null,
      invitedAt: new Date().toISOString(),
    };
  }

  /** Tenant-scoped so an owner can only revoke their own tenant's pending invites. */
  async revokeMemberInvite(tenantId: string, memberId: string): Promise<RevokeMemberInviteOutcome> {
    return this.authRepository.deleteInvitedMember(tenantId, memberId);
  }

  async listTenantMembers(tenantId: string): Promise<TenantMemberRow[]> {
    return this.authRepository.listTenantMembers(tenantId);
  }

  /** Last-owner-guarded; starts the grace period. */
  async requestMemberRemoval(
    tenantId: string,
    memberId: string
  ): Promise<RequestMemberRemovalOutcome> {
    return this.authRepository.requestMemberRemoval(tenantId, memberId);
  }

  async cancelMemberRemoval(
    tenantId: string,
    memberId: string
  ): Promise<CancelMemberRemovalOutcome> {
    return this.authRepository.cancelMemberRemoval(tenantId, memberId);
  }

  async anonymizeUser(userId: string): Promise<{ outcome: 'already_anonymized' | 'anonymized' }> {
    return this.authRepository.anonymizeUser(userId);
  }

  async findTenantsDueForErasurePurge(
    gracePeriodDays: number
  ): Promise<{ id: string; name: string; erasureRequestedAt: string | null }[]> {
    return this.authRepository.findTenantsDueForErasurePurge(gracePeriodDays);
  }

  async findNonAnonymizedUserIdsForTenant(tenantId: string): Promise<string[]> {
    return this.authRepository.findNonAnonymizedUserIdsForTenant(tenantId);
  }

  async findTenantOwnerRecipients(tenantId: string): Promise<ErasureNoticeRecipient[]> {
    return this.authRepository.findTenantOwnerRecipients(tenantId);
  }

  async findTenantsDueForErasureReminder(input: {
    gracePeriodDays: number;
    reminderDaysBefore: number;
  }): Promise<ErasureReminderCandidate[]> {
    return this.authRepository.findTenantsDueForErasureReminder(input);
  }

  async claimErasureReminder(
    tenantId: string
  ): Promise<{ name: string; erasureRequestedAt: string } | null> {
    return this.authRepository.claimErasureReminder(tenantId);
  }

  async releaseErasureReminderClaim(tenantId: string): Promise<void> {
    await this.authRepository.releaseErasureReminderClaim(tenantId);
  }

  async markTenantErased(tenantId: string): Promise<{ name: string } | null> {
    return this.authRepository.markTenantErased(tenantId);
  }

  async findUsersDueForErasurePurge(gracePeriodDays: number): Promise<string[]> {
    return this.authRepository.findUsersDueForErasurePurge(gracePeriodDays);
  }

  async runWithErasurePurgeLock<T>(
    fn: (acquireLock: AcquireErasureLock) => Promise<T>
  ): Promise<T> {
    return this.authRepository.runWithErasurePurgeLock(fn);
  }

  async isTenantStillDueForErasure(tenantId: string, gracePeriodDays: number): Promise<boolean> {
    return this.authRepository.isTenantStillDueForErasure(tenantId, gracePeriodDays);
  }

  async isUserStillDueForErasure(userId: string, gracePeriodDays: number): Promise<boolean> {
    return this.authRepository.isUserStillDueForErasure(userId, gracePeriodDays);
  }

  /** Read-only preview for the accept screen. */
  async findMemberInviteEmailByTokenHash(
    tokenHash: string
  ): Promise<{ email: string; tenantId: string } | null> {
    return this.authRepository.findMemberInviteEmailByTokenHash(tokenHash);
  }

  /** CAS-redeems a member invite by password — see `AuthRepository.acceptMemberInviteWithPassword`. */
  async acceptMemberInviteWithPassword(input: {
    tokenHash: string;
    name: string;
    passwordHash: string;
  }): Promise<AcceptMemberInviteOutcome> {
    return this.authRepository.acceptMemberInviteWithPassword(input);
  }

  /** CAS-redeems a member invite via SSO — see `AuthRepository.acceptMemberInviteWithSsoIdentity`. */
  async acceptMemberInviteWithSsoIdentity(input: {
    tokenHash: string;
    provider: UserIdentityProvider;
    providerUserId: string;
    email: string;
    name: string;
  }): Promise<AcceptMemberInviteOutcome> {
    return this.authRepository.acceptMemberInviteWithSsoIdentity(input);
  }
}
