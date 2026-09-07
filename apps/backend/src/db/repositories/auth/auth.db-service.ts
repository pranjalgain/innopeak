import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import { type DrizzleTransaction } from '@db/db.service';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { Injectable } from '@nestjs/common';

import { ActiveRefreshToken, AuthRepository, UserByEmail } from './auth.repository';

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

export interface VerifiedUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
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
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) {
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

      await this.provisionTenantWorkspace(tx, user.tenantId);

      return {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
      };
    });
  }

  async findUserForLogin(email: string): Promise<UserByEmail | null> {
    return this.authRepository.findUserByEmail(email);
  }

  async findUserById(id: string): Promise<UserByEmail | null> {
    return this.authRepository.findUserById(id);
  }

  async findTenantStatus(tenantId: string): Promise<{ status: TenantStatus } | null> {
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

  async findActiveRefreshToken(tokenHash: string): Promise<ActiveRefreshToken | null> {
    return this.authRepository.findActiveRefreshToken(tokenHash);
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

  /** Daily housekeeping (CronJobName.AUTH_TOKEN_CLEANUP): drops used/expired verify_email codes and revoked/expired refresh tokens. */
  async purgeStaleTokens(): Promise<PurgeStaleTokensResult> {
    return this.authRepository.transaction(async tx => ({
      verifyEmailTokens: await this.authRepository.deleteStaleVerifyEmailTokens(tx),
      refreshTokens: await this.authRepository.deleteStaleRefreshTokens(tx),
    }));
  }
}
