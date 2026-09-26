import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { count, desc, eq, inArray, sql } from 'drizzle-orm';

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

/**
 * The two columns `toConnectionStatus` (`admin-businesses.db-service.ts`) reads, extracted so the
 * full business list and the lean `findConnectionStates` projection below share one definition of
 * "the tenant's latest connection" rather than drifting into two.
 *
 * These two must resolve to the SAME connection row, for the same reason the owner pair below
 * must: `review_provider_connections` is unique on (tenant_id, provider, provider_account_id), so
 * one tenant can hold several. Ordering by `created_at` alone left the tie unbroken — two rows
 * written in one transaction share a timestamp — and each `LIMIT 1` could then legally pick a
 * different one, rendering a live connection's status beside another row's `disconnected_at`.
 * `id` is the unique tiebreaker that makes the two provably agree.
 */
const LATEST_CONNECTION_COLUMNS = {
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

/** Just the pair `toConnectionStatus` needs — see `findConnectionStates`. */
export interface ConnectionStateRow {
  latestConnectionStatus: ReviewProviderConnectionStatus | null;
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
  // The latest-connection pair — see `LATEST_CONNECTION_COLUMNS` above for why the two subqueries
  // must be ordered identically to resolve to the same row.
  ...LATEST_CONNECTION_COLUMNS,
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

  /**
   * Every tenant's latest-connection pair and nothing else — what the admin Statistics page's
   * connection-health tally needs. Deliberately not `findAll()`: that drags three correlated
   * per-tenant subqueries (owner name, owner email, user count) along for columns the tally never
   * reads, so the cost of a headline of four integers grew with both tenant count and their user
   * counts. Still one row per tenant rather than a `GROUP BY`, because the bucketing rule lives in
   * `toConnectionStatus` (TS) — reproducing it as a third SQL `CASE` is exactly the drift hazard
   * `findNeedingAttention` already documents.
   */
  async findConnectionStates(): Promise<ConnectionStateRow[]> {
    const rows = await this.dbService.db.select(LATEST_CONNECTION_COLUMNS).from(schema.tenants);
    return rows;
  }

  /** Total tenant count, across the whole platform — the Overview page's "Businesses" stat card. */
  async count(): Promise<number> {
    const rows = await this.dbService.db.select({ value: count() }).from(schema.tenants);
    return rows[0]?.value ?? 0;
  }

  /**
   * The most recently created tenants, capped at `limit` — same columns and correlated subqueries
   * as `findAll`, for the Overview page's "Recent Businesses" card, which needs a small page
   * rather than the full list `findAll` returns for the Businesses management screen.
   */
  async findRecent(limit: number): Promise<AdminBusinessRow[]> {
    const rows = await this.dbService.db
      .select(ADMIN_BUSINESS_COLUMNS)
      .from(schema.tenants)
      .orderBy(desc(schema.tenants.createdAt))
      .limit(limit);

    return rows as AdminBusinessRow[];
  }

  /**
   * The tenants the "Needs Attention" panel shows: every non-connected tenant, most urgent first
   * (a broken connection on a live customer outranks one that never onboarded), capped at `limit`
   * — same columns as `findAll`/`findRecent`, but filtered, ordered and limited in SQL instead of
   * loading every tenant to filter/sort/slice in JS (the deleted `selectBusinessesNeedingAttention`
   * did that over `findAll()`'s full result). `toConnectionStatus` (`admin-businesses.db-service.ts`)
   * remains the one source of truth for what `BusinessConnectionStatus` a tenant has for display;
   * the CASE below independently reproduces its "is it connected, how urgent" predicate to filter
   * and rank in SQL, since Postgres can't call a TS function mid-query. There is no shared
   * definition and no test asserting the two agree — if `BusinessConnectionStatus` ever gains a
   * new state, `toConnectionStatus` can be updated without anyone noticing this CASE also needs to
   * change, and the panel would silently mis-filter or mis-order with no compiler/test signal.
   *
   * Wrapped as a subquery because `latestConnectionStatus`/`latestConnectionDisconnectedAt` are
   * themselves correlated-subquery columns — Postgres can't reference a SELECT-list alias in that
   * same query's own WHERE/ORDER BY, only a query built on top of it can.
   *
   * The inner subquery only projects what's needed to filter/rank/limit (`id`, `createdAt`, and
   * the two connection columns) rather than all of `ADMIN_BUSINESS_COLUMNS`. The other three
   * columns (`ownerName`/`ownerEmail`/`userCount`) are each a correlated scalar subquery — if they
   * were included here, the outer WHERE/ORDER BY/LIMIT referencing this subquery's own columns
   * would likely stop Postgres from deferring their evaluation past the filter, so every tenant in
   * the table (including the majority excluded for already being connected) would pay for those
   * three subqueries just to be filtered out. Instead, the full `ADMIN_BUSINESS_COLUMNS` shape is
   * only re-fetched for the handful of tenant ids that actually survive the filter/limit.
   */
  async findNeedingAttention(limit: number): Promise<AdminBusinessRow[]> {
    const sub = this.dbService.db
      .select({
        id: schema.tenants.id,
        createdAt: schema.tenants.createdAt,
        latestConnectionStatus: ADMIN_BUSINESS_COLUMNS.latestConnectionStatus,
        latestConnectionDisconnectedAt: ADMIN_BUSINESS_COLUMNS.latestConnectionDisconnectedAt,
      })
      .from(schema.tenants)
      .as('sub');

    // Lower sorts first: disconnected outranks needs-reauth outranks never-connected. `NULL` (the
    // connected case, excluded by the WHERE below) never reaches the ORDER BY.
    const priorityExpr = sql<number | null>`
      CASE
        WHEN ${sub.latestConnectionDisconnectedAt} IS NOT NULL THEN 0
        WHEN ${sub.latestConnectionStatus} = ${ReviewProviderConnectionStatus.NEEDS_REAUTH} THEN 1
        WHEN ${sub.latestConnectionStatus} IS NULL THEN 2
        ELSE NULL
      END
    `;

    const filtered = await this.dbService.db
      .select({ id: sub.id })
      .from(sub)
      .where(sql`${priorityExpr} IS NOT NULL`)
      .orderBy(priorityExpr, desc(sub.createdAt))
      .limit(limit);

    if (filtered.length === 0) {
      return [];
    }

    const ids = filtered.map(row => row.id);

    // No ORDER BY here — `IN`/`inArray` gives no ordering guarantee, so the priority/tie-break
    // order established above is re-applied in JS from `ids`, which already carries it.
    const decorated = await this.dbService.db
      .select(ADMIN_BUSINESS_COLUMNS)
      .from(schema.tenants)
      .where(inArray(schema.tenants.id, ids));

    const byId = new Map(decorated.map(row => [row.id, row]));
    const rows = ids
      .map(id => byId.get(id))
      .filter((row): row is (typeof decorated)[number] => row !== undefined);

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
