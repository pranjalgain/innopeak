import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import type { Locale } from '@common/i18n/locale';
import { type DrizzleTransaction } from '@db/db.service';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { Injectable } from '@nestjs/common';

import {
  AuthRepository,
  PlatformAdminByEmail,
  RefreshTokenRow,
  UserByEmail,
} from './auth.repository';

import { PromptsRepository } from '../prompts/prompts.repository';

/** Index name Postgres reports as `constraint` on the 23505 a losing concurrent signup raises — see 0002_tenant_auth.sql. */
const USERS_EMAIL_ACTIVE_INDEX = 'idx_users_email_active';

export interface PurgeStaleTokensResult {
  verifyEmailTokens: number;
  refreshTokens: number;
}

export interface SignupResult {
  tenantId: string;
  userId: string;
  status: UserStatus.PENDING_VERIFICATION;
  ownerName: string;
}

export interface SignupInput {
  businessName: string;
  ownerName: string;
  email: string; // already normalized (trimmed, lowercased) by the caller
  passwordHash: string;
  tokenHash: string;
  tokenExpiresAt: Date;
}

/**
 * `'unknown'` deliberately carries no user and no reason — what it means is an AuthService-level
 * decision (NO_ACCOUNT for a login round trip, a pending signup for a signup one), not this DB
 * service's to make. See `resolveGoogleIdentity`.
 */
export type GoogleIdentityLookup = { kind: 'known'; user: VerifiedUser } | { kind: 'unknown' };

/** The `tenants` columns every sign-in path needs: `status` to refuse a suspended one, `name` for the token response. */
export interface TenantRow {
  status: TenantStatus;
  name: string;
}

export interface VerifiedUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string | null;
  /**
   * Carried so callers can apply the same standing checks password login does. It used to be
   * dropped here, which is how the Google callback ended up with no way to refuse a `disabled`
   * account — see AuthService.handleGoogleCallback.
   */
  status: UserStatus;
  /** Null means "never chose" — see the `locale` column comment in 0002_tenant_auth.sql. */
  locale: Locale | null;
}

/**
 * Owns every auth transaction — AuthService/TokenService never touch AuthRepository or run a
 * query themselves (module-structure.md). Several methods below are thin pass-throughs (a
 * single repository call, no composition) — kept here rather than skipped so that invariant
 * holds without exception, not because each one does real composition work.
 */
@Injectable()
export class AuthDbService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly promptsRepository: PromptsRepository
  ) {}

  /**
   * Returns null when the email is already registered (any status, any tenant) — caller maps that
   * to a 409. The up-front `findUserByEmail` is only the cheap common-case answer; the actual
   * guarantee is `idx_users_email_active` (partial unique on `users(email) WHERE anonymized_at IS
   * NULL`). Two simultaneous signups for one email both pass the pre-check, and then exactly one
   * `insertOwnerUser` commits — the loser's unique violation rolls back its tenant + settings and
   * is reported as the same null (observed before this: 5 concurrent signups → 4 tenants).
   */
  async signup(input: SignupInput): Promise<SignupResult | null> {
    const existing = await this.authRepository.findUserByEmail(input.email);
    if (existing) {
      return null;
    }

    const tokenExpiresAt = input.tokenExpiresAt.toISOString();
    try {
      return await this.authRepository.transaction(async tx => {
        const tenant = await this.authRepository.insertTenant(tx, { name: input.businessName });
        const user = await this.authRepository.insertOwnerUser(tx, {
          tenantId: tenant.id,
          name: input.ownerName,
          email: input.email,
          passwordHash: input.passwordHash,
        });
        await this.authRepository.insertTenantSettings(tx, { tenantId: tenant.id });
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
   * Everything a tenant needs before its dashboard is usable. Called at the moment the tenant
   * becomes real — today that is email verification; a future already-verified signup path
   * (Microsoft/Google SSO asserts a verified email, so it activates in one step) must call this
   * too rather than repeating the inserts.
   *
   * Deliberately not done at signup: a `pending_verification` tenant may never activate, and
   * provisioning there would leave prompt rows behind for accounts that never existed in any
   * meaningful sense.
   *
   * Safe to call more than once — `insertDefaultsForTenant` conflicts away on the
   * `(tenant_id, category)` unique index. That matters because a tenant can have several users,
   * and each of them verifying reaches this same path.
   */
  private async provisionTenantWorkspace(tx: DrizzleTransaction, tenantId: string): Promise<void> {
    await this.promptsRepository.insertDefaultsForTenant(tx, tenantId);
  }

  /**
   * Resolves a Google identity against `user_identities`/`users` — never creates anything. Two
   * cases sign the caller in; the third tells the caller this is a genuinely new person, and
   * creating their tenant needs one more thing Google cannot supply.
   *
   *  1. **Known identity** — a `user_identities` row for this `sub`. Sign in.
   *  2. **Known email, no identity** — the person signed up with a password and is now using the
   *     Google button. Link the identity and sign in. Safe because Google has verified the
   *     address, and the alternative is a dead end: the UI offers a button that cannot work.
   *  3. **Neither** — `{ kind: 'unknown' }`. What this means depends on intent, which is a business
   *     rule this DB service deliberately does not make: the caller (AuthService) turns it into
   *     `NO_ACCOUNT` for a login round trip, or into a pending signup — see
   *     `completeGoogleSignup` — for a signup one. This split used to live here, gated on whether
   *     the caller happened to pass a `businessName`; that baked an intent-shaped decision into the
   *     data layer, which is what `completeGoogleSignup` now exists to undo.
   */
  async resolveGoogleIdentity(input: {
    providerUserId: string;
    email: string;
  }): Promise<GoogleIdentityLookup> {
    const existingIdentity = await this.authRepository.findUserIdByIdentity(
      UserIdentityProvider.GOOGLE,
      input.providerUserId
    );

    if (existingIdentity) {
      const user = await this.authRepository.findUserById(existingIdentity.userId);
      // An identity row with no matching user is unreachable in practice (nothing hard-deletes a
      // user), so this is treated the same as never having seen this person — not worth a third
      // branch for a case that can't occur.
      return user === null
        ? { kind: 'unknown' }
        : { kind: 'known', user: this.toVerifiedUser(user) };
    }

    const byEmail = await this.authRepository.findUserByEmail(input.email);
    if (byEmail) {
      // Google has verified this address, so linking also *finishes* a signup that stalled at the
      // OTP screen: without this the account stayed `pending_verification` (and its tenant
      // `pending_activation`) forever while being perfectly usable through the Google button, and
      // password login kept mailing codes for an account that was already proven.
      const activated = await this.authRepository.transaction(async tx => {
        await this.authRepository.upsertUserIdentity(tx, {
          userId: byEmail.id,
          provider: UserIdentityProvider.GOOGLE,
          providerUserId: input.providerUserId,
          email: input.email,
        });

        if (byEmail.status !== UserStatus.PENDING_VERIFICATION) {
          return false;
        }

        const promoted = await this.authRepository.activateUser(tx, byEmail.id);
        if (promoted) {
          // Pre-hijack defence, and the reason this branch is not a plain "link and activate".
          //
          // A `pending_verification` row's password was typed by whoever ran signup, and nothing
          // has proven that was the mailbox owner: anyone can sign up as victim@example.com and
          // simply ignore the OTP that lands in the victim's inbox. Google verifying the address
          // proves the *mailbox*, not the password — so activating this row with that password
          // still attached would hand the squatter permanent password access to a tenant the
          // victim now owns (and, worse, their connected Business Profile), with a business name
          // they never typed as the only tell.
          //
          // The unproven password is therefore dropped along with its outstanding code. The
          // account works through Google immediately and can adopt a password of its own via
          // `POST /v1/auth/set-password`, which `hasPassword: false` already drives in Settings.
          await this.authRepository.clearPasswordHash(tx, byEmail.id);
          await this.authRepository.deleteVerifyEmailTokensForUser(tx, byEmail.id);

          await this.authRepository.activateTenant(tx, byEmail.tenantId);
          // The OTP path provisions here too — an account that never reaches `verifyEmail` would
          // otherwise own a tenant with no prompts.
          await this.provisionTenantWorkspace(tx, byEmail.tenantId);
        }
        return promoted;
      });

      return {
        kind: 'known',
        user: this.toVerifiedUser(
          activated ? { ...byEmail, status: UserStatus.ACTIVE, passwordHash: null } : byEmail
        ),
      };
    }

    return { kind: 'unknown' };
  }

  /**
   * The other half of a deferred Google signup: called once a business name has been collected,
   * with the identity Google already verified at the callback. Same shape as the old inline
   * creation branch of `resolveGoogleIdentity` — tenant + owner + settings + identity + prompts,
   * one transaction — just triggered later, after the one thing Google cannot supply is known.
   *
   * The created owner is `active` and email-verified immediately, which is exactly the
   * "already-verified signup path" `provisionTenantWorkspace` was written for: it never reaches
   * `verifyEmail`, so it provisions its own workspace here or the tenant would have no prompts.
   *
   * Returns null on the same race `signup` guards against — someone else registered this exact
   * email in the window between the OAuth callback and this call (a password signup, or a second
   * Google round trip). The caller reports a clean conflict rather than a 500.
   */
  async completeGoogleSignup(input: {
    providerUserId: string;
    email: string;
    name: string | null;
    businessName: string;
  }): Promise<VerifiedUser | null> {
    const ownerName = input.name ?? input.email;

    try {
      return await this.authRepository.transaction(async tx => {
        const tenant = await this.authRepository.insertTenant(tx, { name: input.businessName });
        const user = await this.authRepository.insertVerifiedOwnerUser(tx, {
          tenantId: tenant.id,
          name: ownerName,
          email: input.email,
        });
        await this.authRepository.insertTenantSettings(tx, { tenantId: tenant.id });
        await this.authRepository.upsertUserIdentity(tx, {
          userId: user.id,
          provider: UserIdentityProvider.GOOGLE,
          providerUserId: input.providerUserId,
          email: input.email,
        });
        // Google already verified the owner's email, so this tenant is activated on the spot
        // rather than waiting for an OTP round trip it will never make.
        await this.authRepository.activateTenant(tx, tenant.id);
        await this.provisionTenantWorkspace(tx, tenant.id);

        return {
          id: user.id,
          tenantId: tenant.id,
          email: input.email,
          name: ownerName,
          role: UserRole.OWNER,
          // A Google signup never sets `password_hash` — there is nothing to hash yet.
          passwordHash: null,
          status: UserStatus.ACTIVE,
          // A brand new row — nobody has had the chance to choose a locale yet.
          locale: null,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error, USERS_EMAIL_ACTIVE_INDEX)) {
        return null;
      }
      throw error;
    }
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
  async putVerifyEmailToken(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    await this.authRepository.transaction(tx =>
      this.authRepository.putVerifyEmailToken(tx, { userId, tokenHash, expiresAt })
    );
  }

  /**
   * Returns null when the code doesn't match, was already used, is expired, or the account isn't
   * `pending_verification` — the caller (AuthService) turns that into the uniform
   * INVALID_OR_EXPIRED_OTP error, never distinguishing which (auth API reference's Security
   * considerations). On success, returns everything the caller needs to issue tokens.
   */
  async verifyEmail(email: string, tokenHash: string): Promise<VerifiedUser | null> {
    const user = await this.authRepository.findUserByEmail(email);
    if (user?.status !== UserStatus.PENDING_VERIFICATION) {
      return null;
    }

    return this.authRepository.transaction(async tx => {
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

      // The owner's email is now proven, which is what `tenants.status` tracks — nothing else in
      // the codebase ever moved it off its `pending_activation` default.
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
  }

  async findUserForLogin(email: string): Promise<UserByEmail | null> {
    return this.authRepository.findUserByEmail(email);
  }

  async findPlatformAdminForLogin(email: string): Promise<PlatformAdminByEmail | null> {
    return this.authRepository.findPlatformAdminByEmail(email);
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

  async insertRefreshToken(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    await this.authRepository.transaction(tx =>
      this.authRepository.insertRefreshToken(tx, { userId, tokenHash, expiresAt })
    );
  }

  /** See `AuthRepository.findRefreshTokenByHash` — includes already-revoked rows, so reuse of a spent token is distinguishable from a token that never existed. */
  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    return this.authRepository.findRefreshTokenByHash(tokenHash);
  }

  /** See `AuthRepository.hasActiveRefreshToken` — distinguishes a lost rotation race from a dead session. */
  async hasActiveRefreshToken(userId: string): Promise<boolean> {
    return this.authRepository.hasActiveRefreshToken(userId);
  }

  /**
   * Single-use rotation as one atomic step: revoke the spent token and persist its replacement in
   * the same transaction, and only persist if the revoke actually flipped the row. Returns false
   * (and persists nothing) when the token had already been spent — a concurrent rotation, or a
   * replay — so the caller can reject instead of minting a second live session off one token.
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

  /**
   * Password change: write the new hash and kill every existing session in one transaction so a
   * crash between the two cannot leave the old password live alongside already-revoked tokens
   * (or the reverse — a new hash with old refresh tokens still valid).
   */
  async updatePasswordAndRevokeSessions(userId: string, passwordHash: string): Promise<void> {
    await this.authRepository.transaction(async tx => {
      await this.authRepository.updatePasswordHash(tx, { userId, passwordHash });
      await this.authRepository.revokeAllRefreshTokensForUser(tx, userId);
    });
  }

  /** Settings → Profile's language preference. No session revoke — unlike a password change, a locale is not a security boundary. */
  async updateLocale(userId: string, locale: Locale): Promise<void> {
    await this.authRepository.transaction(tx =>
      this.authRepository.updateLocale(tx, { userId, locale })
    );
  }

  /** Daily housekeeping (CronJobName.AUTH_TOKEN_CLEANUP): drops used/expired verify_email codes and revoked/expired refresh tokens. */
  async purgeStaleTokens(): Promise<PurgeStaleTokensResult> {
    return this.authRepository.transaction(async tx => ({
      verifyEmailTokens: await this.authRepository.deleteStaleVerifyEmailTokens(tx),
      refreshTokens: await this.authRepository.deleteStaleRefreshTokens(tx),
    }));
  }
}
