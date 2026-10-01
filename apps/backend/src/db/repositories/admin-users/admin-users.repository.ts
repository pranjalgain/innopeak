import { UserStatus } from '@auth/enums/user-status.enum';
import { escapeLikePattern } from '@common/helpers/like-pattern.utils';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';

import type { AdminUserRow, ToggleActiveOutcome } from './types/admin-users.type';

const ADMIN_USER_COLUMNS = {
  id: schema.users.id,
  businessId: schema.users.tenantId,
  businessName: schema.tenants.name,
  name: schema.users.name,
  email: schema.users.email,
  role: schema.users.role,
  status: schema.users.status,
  // A correlated scalar subquery rather than a JOIN + GROUP BY: at most one row per user either
  // way, and this keeps the query a plain SELECT with no aggregation to get wrong on the other
  // (non-aggregated) columns above.
  lastLoginAt: sql<string | null>`(
    SELECT MAX(${schema.refreshTokens.createdAt})
    FROM ${schema.refreshTokens}
    WHERE ${schema.refreshTokens.userId} = ${schema.users.id}
  )`.as('last_login_at'),
} as const;

/**
 * Cross-tenant reads/writes over `users` — the one place in this codebase that queries `users`
 * without scoping to a single tenant, since the Super Admin area's whole purpose is to see across
 * every tenant. `AuthRepository` (tenant-scoped or single-row) is a different domain; nothing here
 * duplicates it.
 */
@Injectable()
export class AdminUsersRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Every non-anonymized user, across every tenant, newest first, optionally narrowed by `search`
   * (name or business name substring, case-insensitive — the two fields the Users screen's search
   * box has always searched, previously client-side via `useSearchFilter`'s `USER_SEARCH_FIELDS`).
   * Both columns are already real, joined columns on this query (unlike the Businesses list's
   * owner name, which needs an `EXISTS` — see `businessSearchCondition`), so a plain `or(ilike, ilike)`
   * is enough here. No pagination yet; the Users screen still pages the result client-side.
   *
   * `lastLoginAt` is approximated from the most recent `refresh_tokens` row this user was ever
   * issued (login, verify-email, a Google callback, or a refresh rotation all mint one) — there is
   * no dedicated `last_login_at` column on `users` yet, and adding one would mean touching every
   * token-issuing path in the auth module. A user who never completed signup (no session ever
   * issued) correctly reads `null` here.
   */
  async findAll(search?: string): Promise<AdminUserRow[]> {
    const pattern = search ? `%${escapeLikePattern(search)}%` : undefined;

    const rows = await this.dbService.db
      .select(ADMIN_USER_COLUMNS)
      .from(schema.users)
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.users.tenantId))
      .where(
        and(
          isNull(schema.users.anonymizedAt),
          pattern
            ? or(ilike(schema.users.name, pattern), ilike(schema.tenants.name, pattern))
            : undefined
        )
      )
      .orderBy(desc(schema.users.createdAt));

    return rows as AdminUserRow[];
  }

  /** Total non-anonymized user count, across every tenant — the Overview page's "Users" stat card. Same `anonymized_at IS NULL` filter as `findAll`, for consistency. */
  async count(): Promise<number> {
    const rows = await this.dbService.db
      .select({ value: count() })
      .from(schema.users)
      .where(isNull(schema.users.anonymizedAt));

    return rows[0]?.value ?? 0;
  }

  async findById(userId: string): Promise<AdminUserRow | null> {
    const rows = await this.dbService.db
      .select(ADMIN_USER_COLUMNS)
      .from(schema.users)
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.users.tenantId))
      .where(eq(schema.users.id, userId))
      .limit(1);

    return (rows[0] as AdminUserRow | undefined) ?? null;
  }

  /**
   * A single toggle, not separate activate/deactivate methods, mirroring the frontend's own
   * `toggleActive` — any status other than `disabled` flips to `disabled`, and `disabled` flips
   * back to whatever it must have been. Returns whether a row was actually updated, not the new
   * row — the caller re-reads via `findById` so the response always carries the joined
   * `businessName`/`lastLoginAt`.
   *
   * Re-enabling resolves the target status from `email_verified_at` rather than hardcoding
   * `active`, because `status` alone cannot say what a disabled user was before: this toggle
   * flattens `active` and `pending_verification` onto the same `disabled`. Hardcoding `active`
   * meant two clicks on a never-verified signup (disable, then re-enable) silently promoted them
   * to a fully active account — `AuthService.login` stops returning `pending_verification` and
   * issues real tokens, so the email-verification gate is bypassed for an address nobody ever
   * proved they controlled. It also stranded them the other way: `AuthRepository.activateUser` is
   * scoped to `status = 'pending_verification'`, so once the status had moved on, their real
   * verification link matched zero rows and the tenant never got provisioned.
   *
   * `email_verified_at` is the right source because it is written exactly once, by that same
   * `activateUser`, and nothing ever clears it — so it survives any number of toggles.
   *
   * Refuses to run while `erasure_requested_at` is set (a tenant owner has an active team-member
   * removal request pending on this user) — reactivating a "disabled" user out from under that
   * flag would leave it stale: the user would look active again with no way for anyone to notice
   * the nightly erasure-purge job still has them queued for anonymization once the original grace
   * period elapses. The caller must cancel the pending removal first.
   */
  async toggleActive(userId: string): Promise<ToggleActiveOutcome> {
    const result = await this.dbService.db.execute(sql`
      WITH target AS (
        SELECT id, anonymized_at FROM users WHERE id = ${userId}::uuid
      ),
      updated AS (
        UPDATE users
        SET status = CASE
              WHEN status = ${UserStatus.DISABLED} THEN CASE
                WHEN email_verified_at IS NULL THEN ${UserStatus.PENDING_VERIFICATION}::user_status
                ELSE ${UserStatus.ACTIVE}::user_status
              END
              ELSE ${UserStatus.DISABLED}::user_status
            END,
            updated_at = now()
        WHERE id = ${userId}::uuid AND anonymized_at IS NULL AND erasure_requested_at IS NULL
        RETURNING id
      )
      SELECT target.id AS id, (target.anonymized_at IS NOT NULL) AS anonymized,
             (updated.id IS NOT NULL) AS was_updated
      FROM target
      LEFT JOIN updated ON true
    `);

    const row = result.rows[0] as
      { id: string; anonymized: boolean; was_updated: boolean } | undefined;
    if (row === undefined) {
      return { outcome: 'not_found' };
    }
    if (row.was_updated) {
      return { outcome: 'toggled' };
    }
    return { outcome: row.anonymized ? 'not_found' : 'removal_pending' };
  }
}
