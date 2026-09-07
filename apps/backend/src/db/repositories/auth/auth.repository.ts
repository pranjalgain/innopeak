import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

export interface UserByEmail {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string | null;
  role: 'member' | 'owner';
  status: 'active' | 'disabled' | 'invited' | 'pending_verification';
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

export interface ActiveRefreshToken {
  id: string;
  userId: string;
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
      })
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.anonymizedAt)))
      .orderBy(desc(schema.users.createdAt))
      .limit(1);

    return rows[0] ?? null;
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
      })
      .from(schema.users)
      .where(and(eq(schema.users.id, id), isNull(schema.users.anonymizedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async findTenantStatusById(
    tenantId: string
  ): Promise<{ status: 'active' | 'pending_activation' | 'suspended' } | null> {
    const rows = await this.dbService.db
      .select({ status: schema.tenants.status })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    return rows[0] ?? null;
  }

  /** Row-existence is the only signal for "has this tenant connected a Google Business Profile" — no dedicated flag exists on `tenants`/`tenant_settings`. */
  async hasConnectedBusiness(tenantId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .select({ id: schema.reviewProviderConnections.id })
      .from(schema.reviewProviderConnections)
      .where(eq(schema.reviewProviderConnections.tenantId, tenantId))
      .limit(1);

    return rows.length > 0;
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
        role: 'owner',
        status: 'pending_verification',
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
        purpose: 'verify_email',
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
          eq(schema.passwordResetTokens.purpose, 'verify_email'),
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
      .set({ status: 'active', emailVerifiedAt: sql`now()` })
      .where(and(eq(schema.users.id, userId), eq(schema.users.status, 'pending_verification')))
      .returning({ id: schema.users.id });

    return rows.length > 0;
  }

  async insertRefreshToken(tx: DrizzleTransaction, input: InsertRefreshTokenInput): Promise<void> {
    await tx.insert(schema.refreshTokens).values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });
  }

  async findActiveRefreshToken(tokenHash: string): Promise<ActiveRefreshToken | null> {
    const rows = await this.dbService.db
      .select({ id: schema.refreshTokens.id, userId: schema.refreshTokens.userId })
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.tokenHash, tokenHash),
          isNull(schema.refreshTokens.revokedAt),
          gt(schema.refreshTokens.expiresAt, sql`now()`)
        )
      )
      .limit(1);

    return rows[0] ?? null;
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

  /** Housekeeping — a consumed or expired verify_email code has no further use once its window is over. Returns the number of rows removed. */
  async deleteStaleVerifyEmailTokens(tx: DrizzleTransaction): Promise<number> {
    const rows = await tx
      .delete(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.purpose, 'verify_email'),
          or(
            isNotNull(schema.passwordResetTokens.usedAt),
            lt(schema.passwordResetTokens.expiresAt, sql`now()`)
          )
        )
      )
      .returning({ id: schema.passwordResetTokens.id });

    return rows.length;
  }

  /** Housekeeping — a revoked or expired refresh token can never be honored again (`findActiveRefreshToken` already excludes both), so the row is dead weight. Returns the number of rows removed. */
  async deleteStaleRefreshTokens(tx: DrizzleTransaction): Promise<number> {
    const rows = await tx
      .delete(schema.refreshTokens)
      .where(
        or(
          isNotNull(schema.refreshTokens.revokedAt),
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
