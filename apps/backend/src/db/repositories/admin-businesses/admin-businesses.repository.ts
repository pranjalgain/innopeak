import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';

export interface SetBusinessStatusInput {
  tenantId: string;
  status: TenantStatus;
}

export interface AdminBusinessRow {
  id: string;
  name: string;
  status: TenantStatus;
  ownerName: string | null;
  ownerEmail: string | null;
  userCount: number;
  createdAt: string;
  /** Raw status of the tenant's most-recent connection row — `null` if it has never connected at all. */
  latestConnectionStatus: ReviewProviderConnectionStatus | null;
  /** Whether that most-recent connection row is disconnected — `null` alongside `latestConnectionStatus`. */
  latestConnectionDisconnectedAt: string | null;
}

const ADMIN_BUSINESS_COLUMNS = {
  id: schema.tenants.id,
  name: schema.tenants.name,
  status: schema.tenants.status,
  createdAt: schema.tenants.createdAt,
  // Three correlated scalar subqueries rather than joins: each returns at most one value per
  // tenant, so a JOIN here would either need its own DISTINCT ON/window-function dance (the owner
  // and latest-connection joins) or silently multiply the users join (the count) — a scalar
  // subquery per column keeps each one unambiguous on its own terms.
  //
  // The outer correlation is written as the literal `tenants.id`, not `${schema.tenants.id}`:
  // interpolating a Column inside a `sql` template renders its BARE column name (Drizzle has no
  // notion of "which query" it belongs to here), not a table-qualified one. Since every one of
  // these subqueries selects FROM a table that also has its own `id` column, an interpolated
  // `${schema.tenants.id}` resolved to that INNER table's `id` instead of the outer tenant's —
  // `WHERE tenant_id = id` inside `FROM users` silently became `users.tenant_id = users.id`,
  // which is never true, so every one of these came back null/zero for every tenant. Confirmed via
  // `query.toSQL()` showing the bare unqualified `"id"` in the generated SQL, and by comparing
  // against the exact same query run by hand in psql (which returned the correct values).
  // `ORDER BY created_at, id` is load-bearing on both, and must stay identical between them:
  // nothing in the schema restricts a tenant to a single `role = 'owner'` row (there is no partial
  // unique index for it), so with two owners an unordered `LIMIT 1` in each of these two separate
  // subqueries could legally resolve to *different* rows — rendering one owner's name beside
  // another's email. Ordering both the same way, with `id` as a unique tiebreaker, makes them
  // provably pick the same row, and picks the founding owner (earliest created) rather than an
  // arbitrary one.
  ownerName: sql<string | null>`(
    SELECT ${schema.users.name} FROM ${schema.users}
    WHERE ${schema.users.tenantId} = tenants.id
      AND ${schema.users.role} = ${UserRole.OWNER}
      AND ${schema.users.anonymizedAt} IS NULL
    ORDER BY ${schema.users.createdAt} ASC, ${schema.users.id} ASC
    LIMIT 1
  )`.as('owner_name'),
  ownerEmail: sql<string | null>`(
    SELECT ${schema.users.email} FROM ${schema.users}
    WHERE ${schema.users.tenantId} = tenants.id
      AND ${schema.users.role} = ${UserRole.OWNER}
      AND ${schema.users.anonymizedAt} IS NULL
    ORDER BY ${schema.users.createdAt} ASC, ${schema.users.id} ASC
    LIMIT 1
  )`.as('owner_email'),
  userCount: sql<number>`(
    SELECT COUNT(*)::int FROM ${schema.users}
    WHERE ${schema.users.tenantId} = tenants.id
      AND ${schema.users.anonymizedAt} IS NULL
  )`.as('user_count'),
  // These two must resolve to the SAME connection row, for the same reason the owner pair above
  // must: `review_provider_connections` is unique on (tenant_id, provider, provider_account_id),
  // so one tenant can hold several. Ordering by `created_at` alone left the tie unbroken — two
  // rows written in one transaction share a timestamp — and each `LIMIT 1` could then legally pick
  // a different one, rendering a live connection's status beside another row's `disconnected_at`.
  // `id` is the unique tiebreaker that makes the two provably agree.
  latestConnectionStatus: sql<ReviewProviderConnectionStatus | null>`(
    SELECT ${schema.reviewProviderConnections.status} FROM ${schema.reviewProviderConnections}
    WHERE ${schema.reviewProviderConnections.tenantId} = tenants.id
    ORDER BY ${schema.reviewProviderConnections.createdAt} DESC, ${schema.reviewProviderConnections.id} DESC
    LIMIT 1
  )`.as('latest_connection_status'),
  latestConnectionDisconnectedAt: sql<string | null>`(
    SELECT ${schema.reviewProviderConnections.disconnectedAt} FROM ${schema.reviewProviderConnections}
    WHERE ${schema.reviewProviderConnections.tenantId} = tenants.id
    ORDER BY ${schema.reviewProviderConnections.createdAt} DESC, ${schema.reviewProviderConnections.id} DESC
    LIMIT 1
  )`.as('latest_connection_disconnected_at'),
} as const;

/**
 * Cross-tenant reads/writes over `tenants` — the Super Admin "Businesses" list. Distinct from
 * `AuthRepository.findTenantStatusById` (single-row, by id, for a signed-in tenant's own login
 * flow) and from `ConnectionsRepository` (a signed-in tenant's own connection).
 */
@Injectable()
export class AdminBusinessesRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Every tenant, newest first. No pagination/filter params yet — same reasoning as
   * `AdminUsersRepository.findAll`.
   */
  async findAll(): Promise<AdminBusinessRow[]> {
    const rows = await this.dbService.db
      .select(ADMIN_BUSINESS_COLUMNS)
      .from(schema.tenants)
      .orderBy(desc(schema.tenants.createdAt));

    return rows as AdminBusinessRow[];
  }

  async findById(tenantId: string): Promise<AdminBusinessRow | null> {
    const rows = await this.dbService.db
      .select(ADMIN_BUSINESS_COLUMNS)
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    return (rows[0] as AdminBusinessRow | undefined) ?? null;
  }

  /** Returns whether a row was actually updated — the caller re-reads via `findById`. */
  async setStatus(input: SetBusinessStatusInput): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.tenants)
      .set({ status: input.status, updatedAt: sql`now()` })
      .where(eq(schema.tenants.id, input.tenantId))
      .returning({ id: schema.tenants.id });

    return rows.length > 0;
  }
}
