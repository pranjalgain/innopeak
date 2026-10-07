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
  // Correlated subquery rather than JOIN + GROUP BY, keeping this a plain SELECT with no aggregation.
  lastLoginAt: sql<string | null>`(
    SELECT MAX(${schema.refreshTokens.createdAt})
    FROM ${schema.refreshTokens}
    WHERE ${schema.refreshTokens.userId} = ${schema.users.id}
  )`.as('last_login_at'),
} as const;

/** The one place that queries `users` across tenants (Super Admin). */
@Injectable()
export class AdminUsersRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * `search` matches name or business name, case-insensitive. Not paginated; the Users screen pages client-side.
   *
   * `lastLoginAt` is approximated from the newest `refresh_tokens` row (every token-issuing path
   * mints one); `users` has no `last_login_at` column. Null means no session was ever issued.
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
   * Flips `disabled` and back. Returns whether a row was updated; the caller re-reads for the
   * joined columns.
   *
   * Re-enabling derives the status from `email_verified_at` (written once by `activateUser`, never
   * cleared), not a hardcoded `active`: disabled flattens `active` and `pending_verification`, and
   * promoting a never-verified signup to active would bypass email verification and strand their
   * real verification link (`activateUser` only matches `pending_verification`).
   *
   * Refuses while `erasure_requested_at` is set: reactivating would hide that the nightly purge
   * still has the user queued. The caller must cancel the removal first.
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
