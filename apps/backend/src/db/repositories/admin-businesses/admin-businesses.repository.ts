import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { escapeLikePattern } from '@common/helpers/like-pattern.utils';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { acquireResourceXactLock } from '@db/helpers/advisory-lock.util';
import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type {
  AdminBusinessRow,
  ConnectionStateRow,
  SetBusinessStatusInput,
  SetBusinessStatusOutcome,
} from './types/admin-businesses.type';

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

/**
 * "Who counts as a tenant's owner" — every correlated subquery in this file that needs to find
 * one shares this single definition, so a future change to the rule (e.g. supporting co-owners)
 * can't update some call sites and silently miss another. Used by `ownerName`/`ownerEmail` below
 * (each adds its own `ORDER BY ... LIMIT 1` to pick one row) and by `businessSearchCondition`'s
 * `EXISTS` subquery (no `ORDER BY`/`LIMIT` needed there — existence, not a single value, is all it
 * asks for).
 *
 * The correlation is written as the literal `tenants.id`, not `${schema.tenants.id}`: interpolating
 * a Column inside a `sql` template renders its BARE column name (Drizzle has no notion of "which
 * query" it belongs to here), not a table-qualified one. Since every caller of this function
 * selects/checks existence FROM a table (`users`) that also has its own `id` column, an
 * interpolated `${schema.tenants.id}` would resolve to that INNER table's `id` instead of the outer
 * tenant's — `WHERE tenant_id = id` inside `FROM users` silently becomes `users.tenant_id =
 * users.id`, which is never true, so every caller would come back null/zero/empty for every
 * tenant. Confirmed via `query.toSQL()` showing the bare unqualified `"id"` in the generated SQL,
 * and by comparing against the exact same query run by hand in psql (which returned the correct
 * values) — see `admin-businesses.repository.spec.ts` for a regression test asserting this stays
 * the literal, correlated form.
 */
function ownerPredicate(): SQL {
  return sql`${schema.users.tenantId} = tenants.id
      AND ${schema.users.role} = ${UserRole.OWNER}
      AND ${schema.users.anonymizedAt} IS NULL`;
}

const ADMIN_BUSINESS_COLUMNS = {
  id: schema.tenants.id,
  name: schema.tenants.name,
  status: schema.tenants.status,
  createdAt: schema.tenants.createdAt,
  erasureRequestedAt: schema.tenants.erasureRequestedAt,
  // Three correlated scalar subqueries rather than joins: each returns at most one value per
  // tenant, so a JOIN here would either need its own DISTINCT ON/window-function dance (the owner
  // and latest-connection joins) or silently multiply the users join (the count) — a scalar
  // subquery per column keeps each one unambiguous on its own terms.
  //
  // `ORDER BY created_at, id` is load-bearing on both, and must stay identical between them:
  // nothing in the schema restricts a tenant to a single `role = 'owner'` row (there is no partial
  // unique index for it), so with two owners an unordered `LIMIT 1` in each of these two separate
  // subqueries could legally resolve to *different* rows — rendering one owner's name beside
  // another's email. Ordering both the same way, with `id` as a unique tiebreaker, makes them
  // provably pick the same row, and picks the founding owner (earliest created) rather than an
  // arbitrary one.
  ownerName: sql<string | null>`(
    SELECT ${schema.users.name} FROM ${schema.users}
    WHERE ${ownerPredicate()}
    ORDER BY ${schema.users.createdAt} ASC, ${schema.users.id} ASC
    LIMIT 1
  )`.as('owner_name'),
  ownerEmail: sql<string | null>`(
    SELECT ${schema.users.email} FROM ${schema.users}
    WHERE ${ownerPredicate()}
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
 * `search` matches against the tenant's own name OR its founding owner's name — the same two
 * fields the Businesses screen's search box has always searched (previously client-side via
 * `useSearchFilter`'s `BUSINESS_SEARCH_FIELDS`). Matching only the owner, not any other team
 * member, is a preserved limitation carried over unchanged from that client-side search — it never
 * had any other member's name to filter against either, since `ownerName` was always this same
 * "founding owner only" subquery.
 *
 * The owner check is an `EXISTS` rather than a second `ilike` column, because `ownerName` isn't a
 * real column on `tenants` — it's the correlated scalar subquery in `ADMIN_BUSINESS_COLUMNS`
 * above, which can't be referenced from a WHERE clause the same query builds it in. Exported for
 * `admin-businesses.repository.spec.ts`'s own regression test on the `ownerPredicate()` correlation.
 */
export function businessSearchCondition(search: string): SQL {
  const pattern = `%${escapeLikePattern(search)}%`;
  return sql`(
    ${ilike(schema.tenants.name, pattern)}
    OR EXISTS (
      SELECT 1 FROM ${schema.users}
      WHERE ${ownerPredicate()}
        AND ${ilike(schema.users.name, pattern)}
    )
  )`;
}

/**
 * Cross-tenant reads/writes over `tenants` — the Super Admin "Businesses" list. Distinct from
 * `AuthRepository.findTenantStatusById` (single-row, by id, for a signed-in tenant's own login
 * flow) and from `ConnectionsRepository` (a signed-in tenant's own connection).
 */
@Injectable()
export class AdminBusinessesRepository {
  constructor(private readonly dbService: DBService) {}

  /** Every tenant, newest first, optionally narrowed by `search` (tenant name or owner name
   *  substring, case-insensitive) — see `businessSearchCondition`. No pagination yet; the
   *  Businesses screen still pages the result client-side. */
  async findAll(search?: string): Promise<AdminBusinessRow[]> {
    const where = search ? businessSearchCondition(search) : undefined;

    const rows = await this.dbService.db
      .select(ADMIN_BUSINESS_COLUMNS)
      .from(schema.tenants)
      .where(where)
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

  /**
   * Refuses to run while the tenant has a pending erasure request (`erasure_requested_at` set) —
   * plain suspend/reactivate and the erasure request/cancel flow must never both touch
   * `tenants.status` on the same tenant, or a status change made through this route leaves
   * `erasure_requested_at` stale: reactivating here (instead of through `cancelErasure`) would
   * leave the timestamp set on an ACTIVE tenant, and a later unrelated suspend through this same
   * route would then read as "grace period elapsed, due for purge" to the nightly cron with no new
   * warning. The caller must cancel the pending erasure first.
   *
   * Also refuses — reporting `not_found`, not `erasure_pending` — on a tenant that's already fully
   * `erased`. `erasure_requested_at` intentionally survives as a historical record even after
   * erasure completes (see `markTenantErased`), so without this distinction an already-erased
   * tenant would be told "cancel the pending erasure first" even though `cancelErasure` is
   * guaranteed to refuse on that same tenant (it excludes `erased` too) — a dead-end response with
   * no way forward. Collapsing it into `not_found` matches `requestErasure`'s own convention for an
   * already-erased tenant.
   *
   * Runs inside a transaction holding the same per-tenant `gdpr:tenant-erasure` advisory lock
   * `cancelErasure` takes, so a concurrent `cancelErasure` can't land between this method's update
   * attempt and its fallback read and produce a stale `erasure_pending` report for erasure that was
   * already cancelled by the time this method answered.
   *
   * One round trip either way: a CTE reads the tenant's current `status` alongside attempting the
   * guarded update, so a failed update doesn't need a second, separate existence query to tell
   * `not_found` apart from `erasure_pending`. The caller re-reads via `findById` on `'updated'`.
   */
  async setStatus(input: SetBusinessStatusInput): Promise<SetBusinessStatusOutcome> {
    return this.dbService.db.transaction(async tx => {
      await acquireResourceXactLock(tx, 'gdpr:tenant-erasure', input.tenantId);

      const result = await tx.execute(sql`
        WITH target AS (
          SELECT id, status FROM tenants WHERE id = ${input.tenantId}::uuid
        ),
        updated AS (
          UPDATE tenants
          SET status = ${input.status}::tenant_status, updated_at = now()
          WHERE id = ${input.tenantId}::uuid AND erasure_requested_at IS NULL
          RETURNING id
        )
        SELECT target.id AS id, target.status AS status, (updated.id IS NOT NULL) AS was_updated
        FROM target
        LEFT JOIN updated ON true
      `);

      const row = result.rows[0] as
        { id: string; status: TenantStatus; was_updated: boolean } | undefined;
      if (row === undefined) {
        return { outcome: 'not_found' };
      }
      if (row.was_updated) {
        return { outcome: 'updated' };
      }
      if (row.status === TenantStatus.ERASED) {
        return { outcome: 'not_found' };
      }
      return { outcome: 'erasure_pending' };
    });
  }

  /**
   * Suspends the tenant immediately and starts its grace period — mirrors `setStatus`'s exact
   * shape. Reads as `suspended` (not a fourth in-between status) for the whole grace period, so
   * every existing suspend-check keeps working unmodified; only the nightly erasure-purge job
   * flips it to the terminal `erased`. Scoped off an already-erased tenant — nothing left to
   * request there. Returns whether a row was actually updated — the caller re-reads via `findById`.
   */
  async requestErasure(tenantId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.tenants)
      .set({
        status: TenantStatus.SUSPENDED,
        erasureRequestedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(schema.tenants.id, tenantId), ne(schema.tenants.status, TenantStatus.ERASED)))
      .returning({ id: schema.tenants.id });

    return rows.length > 0;
  }

  /**
   * Undoes `requestErasure` — a clean, full undo, since nothing is anonymized until the grace
   * period actually elapses. Scoped to a tenant that still has `erasure_requested_at` set AND is
   * not already `erased` — without the latter guard, cancelling an already-fully-erased tenant
   * (whose `erasure_requested_at` intentionally survives as a historical record, per
   * `markTenantErased`) would silently un-erase it, reactivating a tenant every one of whose users
   * has already been anonymized.
   *
   * Holds a per-tenant advisory lock (`hashtext('gdpr:tenant-erasure'), hashtext(tenantId)`) for
   * the same reason `AuthRepository.requestMemberRemoval`'s owner-guard lock is per-tenant: the
   * nightly erasure-purge cron job (`CronService.purgeErasureRequests`, via the `acquireLock`
   * callback `AuthRepository.runWithErasurePurgeLock` hands it) takes the identical lock, scoped to
   * the same tenant, before anonymizing that tenant's users — without sharing this lock, an admin
   * calling cancelErasure while the cron is mid-loop for the same tenant could "succeed" here while
   * the cron, already holding a stale in-memory user list, keeps anonymizing users regardless.
   * Whoever loses the race for the lock re-reads the tenant's true current state afterward instead
   * of racing past it. `setStatus` takes this same lock too, for the identical reason.
   */
  async cancelErasure(tenantId: string): Promise<boolean> {
    return this.dbService.db.transaction(async tx => {
      await acquireResourceXactLock(tx, 'gdpr:tenant-erasure', tenantId);

      const rows = await tx
        .update(schema.tenants)
        .set({ status: TenantStatus.ACTIVE, erasureRequestedAt: null, updatedAt: sql`now()` })
        .where(
          and(
            eq(schema.tenants.id, tenantId),
            isNotNull(schema.tenants.erasureRequestedAt),
            ne(schema.tenants.status, TenantStatus.ERASED)
          )
        )
        .returning({ id: schema.tenants.id });

      return rows.length > 0;
    });
  }
}
