import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

export interface AdminUserRow {
  id: string;
  businessId: string;
  businessName: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** Most recent `refresh_tokens.created_at` for this user — see `findAll`'s own comment for why
   * this stands in for a real `last_login_at` column, which does not exist on `users`. */
  lastLoginAt: string | null;
}

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
   * Every non-anonymized user, across every tenant, newest first. No pagination/filter params
   * yet — the Super Admin area has no user-search UI today, and the frontend already does its own
   * client-side paging over the full list; add real query params here if that changes.
   *
   * `lastLoginAt` is approximated from the most recent `refresh_tokens` row this user was ever
   * issued (login, verify-email, a Google callback, or a refresh rotation all mint one) — there is
   * no dedicated `last_login_at` column on `users` yet, and adding one would mean touching every
   * token-issuing path in the auth module. A user who never completed signup (no session ever
   * issued) correctly reads `null` here.
   */
  async findAll(): Promise<AdminUserRow[]> {
    const rows = await this.dbService.db
      .select(ADMIN_USER_COLUMNS)
      .from(schema.users)
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.users.tenantId))
      .where(isNull(schema.users.anonymizedAt))
      .orderBy(desc(schema.users.createdAt));

    return rows as AdminUserRow[];
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
   */
  async toggleActive(userId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.users)
      .set({
        status: sql`CASE
          WHEN ${schema.users.status} = ${UserStatus.DISABLED}
            THEN CASE
              WHEN ${schema.users.emailVerifiedAt} IS NULL
                THEN ${UserStatus.PENDING_VERIFICATION}::user_status
              ELSE ${UserStatus.ACTIVE}::user_status
            END
          ELSE ${UserStatus.DISABLED}::user_status
        END`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(schema.users.id, userId), isNull(schema.users.anonymizedAt)))
      .returning({ id: schema.users.id });

    return rows.length > 0;
  }

  /**
   * Cross-tenant existence check by email, anonymized rows excluded — used by
   * `AdminSettingsService.sendInvite` so a platform-admin invite can never be issued to an email
   * that already owns a tenant account (see that method's own comment for why: `platform_admins`
   * and `users` are entirely separate identity tables, and login resolves a collision by checking
   * `platform_admins` first, silently shadowing the tenant account).
   */
  async existsByEmail(email: string): Promise<boolean> {
    const rows = await this.dbService.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.anonymizedAt)))
      .limit(1);

    return rows.length > 0;
  }
}
