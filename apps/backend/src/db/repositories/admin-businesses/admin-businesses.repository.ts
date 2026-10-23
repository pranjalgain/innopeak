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
  RequestErasureOutcome,
  SetBusinessStatusInput,
  SetBusinessStatusOutcome,
} from './types/admin-businesses.type';

/**
 * Shared by the full list and the lean `findConnectionStates`. Both subqueries must resolve to the SAME
 * connection row (a tenant can hold several): `id` breaks `created_at` ties so a live status is never
 * rendered beside another row's `disconnected_at`.
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
 * Single definition of "a tenant's owner" for every correlated subquery here (`ownerName`/`ownerEmail`, which
 * add their own ORDER BY ... LIMIT 1, and `businessSearchCondition`'s EXISTS).
 *
 * The correlation is the literal `tenants.id`, not `${schema.tenants.id}`: a Column interpolated into `sql`
 * renders its bare name, which inside `FROM users` resolves to `users.id` (never true), so every caller would
 * come back empty. Guarded by `admin-businesses.repository.spec.ts`.
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
  // Scalar subqueries rather than joins: each yields at most one value per tenant, avoiding DISTINCT ON
  // gymnastics and a multiplied users join.
  //
  // `ORDER BY created_at, id` must stay identical for owner name and email: nothing restricts a tenant to one
  // `role = 'owner'` row, so unordered LIMIT 1s could pick different owners (one's name beside another's email).
  // `id` is the tiebreaker; this also picks the founding owner.
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
  ...LATEST_CONNECTION_COLUMNS,
} as const;

/**
 * Matches the tenant name OR its founding owner's name (not other members). The owner check is an EXISTS because
 * `ownerName` is a SELECT-list subquery that a WHERE in the same query cannot reference.
 * Exported for the correlation regression test in `admin-businesses.repository.spec.ts`.
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

@Injectable()
export class AdminBusinessesRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * One page, newest first. The total counts with the very same `where` as the page, so the two can never disagree;
   * `id` breaks `created_at` ties so a page boundary is stable.
   */
  async findPage(input: {
    search?: string | undefined;
    page: number;
    pageSize: number;
  }): Promise<{ rows: AdminBusinessRow[]; total: number }> {
    const where = input.search ? businessSearchCondition(input.search) : undefined;

    const [rows, totals] = await Promise.all([
      this.dbService.db
        .select(ADMIN_BUSINESS_COLUMNS)
        .from(schema.tenants)
        .where(where)
        .orderBy(desc(schema.tenants.createdAt), desc(schema.tenants.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.dbService.db.select({ value: count() }).from(schema.tenants).where(where),
    ]);

    return { rows: rows as AdminBusinessRow[], total: totals[0]?.value ?? 0 };
  }

  /**
   * Only the latest-connection pair, for the Statistics connection-health tally: `findAll()` would drag the
   * owner/user-count subqueries along for nothing. One row per tenant rather than a GROUP BY, because the
   * bucketing rule lives in `toConnectionStatus` (TS) and a third SQL CASE is the drift hazard
   * `findNeedingAttention` documents.
   */
  async findConnectionStates(): Promise<ConnectionStateRow[]> {
    const rows = await this.dbService.db.select(LATEST_CONNECTION_COLUMNS).from(schema.tenants);
    return rows;
  }

  async count(): Promise<number> {
    const rows = await this.dbService.db.select({ value: count() }).from(schema.tenants);
    return rows[0]?.value ?? 0;
  }

  async findRecent(limit: number): Promise<AdminBusinessRow[]> {
    const rows = await this.dbService.db
      .select(ADMIN_BUSINESS_COLUMNS)
      .from(schema.tenants)
      .orderBy(desc(schema.tenants.createdAt))
      .limit(limit);

    return rows as AdminBusinessRow[];
  }

  /**
   * Non-connected tenants, most urgent first (a broken live connection outranks one that never onboarded),
   * filtered, ordered and limited in SQL. The CASE below reproduces `toConnectionStatus`'s predicate independently
   * (Postgres cannot call TS) with no shared definition or test: a new `BusinessConnectionStatus` state could be
   * added there without this CASE noticing, silently mis-filtering the panel.
   *
   * Wrapped as a subquery because Postgres cannot reference a SELECT-list alias in its own WHERE/ORDER BY.
   * The inner query projects only what filter/rank/limit need; including the owner/user-count scalar subqueries
   * would likely make every tenant pay for them before being filtered out, so the full `ADMIN_BUSINESS_COLUMNS`
   * shape is re-fetched only for the surviving ids.
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

    // Lower sorts first: disconnected, needs-reauth, never-connected. NULL (connected) is excluded by the WHERE.
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
   * Refuses while an erasure request is pending: reactivating here would leave `erasure_requested_at` set on an
   * ACTIVE tenant, and a later suspend would read as "grace period elapsed, due for purge" to the nightly cron.
   * The caller must cancel the erasure first.
   *
   * An already `erased` tenant reports `not_found`, not `erasure_pending`: `erasure_requested_at` survives erasure
   * (see `markTenantErased`) and `cancelErasure` refuses it too, so "cancel first" would be a dead end.
   *
   * Runs under the same per-tenant `gdpr:tenant-erasure` advisory lock as `cancelErasure`, so a concurrent cancel
   * cannot produce a stale `erasure_pending`. A CTE reads `status` alongside the guarded update, so a failed update
   * needs no second query to tell the outcomes apart.
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
        // `target` is read before the update, so its status is the one the tenant had until now.
        return { outcome: 'updated', changed: row.status !== input.status };
      }
      if (row.status === TenantStatus.ERASED) {
        return { outcome: 'not_found' };
      }
      return { outcome: 'erasure_pending' };
    });
  }

  /**
   * Suspends immediately and starts the grace period. Stays `suspended` (no in-between status) so existing
   * suspend-checks keep working; only the nightly purge flips it to `erased`. Skips an already-erased tenant.
   *
   * Asking again while an admin's request is already pending changes nothing (and does not restart the grace period).
   * An owner's own pending request is still taken over: an admin's request removes the owner's right to restore by
   * signing in, so it is a real change.
   */
  async requestErasure(tenantId: string): Promise<RequestErasureOutcome> {
    // The same per-tenant lock the nightly purge and `cancelErasure` take: without it a request could land between the purge reading its due
    // list and anonymizing, restarting a grace period the purge was about to finish.
    const result = await this.dbService.db.transaction(async tx => {
      await acquireResourceXactLock(tx, 'gdpr:tenant-erasure', tenantId);
      return tx.execute(sql`
      WITH target AS (
        SELECT id, status,
               (erasure_requested_at IS NOT NULL AND erasure_requested_by_user_id IS NULL) AS admin_pending
        FROM tenants WHERE id = ${tenantId}::uuid
      ),
      updated AS (
        UPDATE tenants
        SET status_before_erasure = COALESCE(status_before_erasure, status),
            status = ${TenantStatus.SUSPENDED}::tenant_status,
            erasure_requested_at = now(),
            erasure_requested_by_user_id = NULL,
            erasure_reminder_sent_at = NULL,
            updated_at = now()
        WHERE id = ${tenantId}::uuid
          AND status <> ${TenantStatus.ERASED}::tenant_status
          AND NOT (erasure_requested_at IS NOT NULL AND erasure_requested_by_user_id IS NULL)
        RETURNING id
      )
      SELECT target.status AS status, target.admin_pending AS admin_pending, (updated.id IS NOT NULL) AS was_updated
      FROM target
      LEFT JOIN updated ON true
    `);
    });

    const row = result.rows[0] as
      { status: TenantStatus; admin_pending: boolean; was_updated: boolean } | undefined;
    if (row === undefined || row.status === TenantStatus.ERASED) {
      return 'not_found';
    }
    return row.was_updated ? 'requested' : 'already_requested';
  }

  /**
   * A full undo, since nothing is anonymized until the grace period elapses. Skips an `erased` tenant: its
   * `erasure_requested_at` survives as history, so cancelling would silently un-erase a tenant whose users are
   * already anonymized.
   *
   * Takes the per-tenant advisory lock the nightly purge (`CronService.purgeErasureRequests`, via
   * `AuthRepository.runWithErasurePurgeLock`) also takes, so a cancel cannot "succeed" while the cron, holding a
   * stale user list, keeps anonymizing. `setStatus` shares it.
   */
  async cancelErasure(tenantId: string): Promise<boolean> {
    return this.dbService.db.transaction(async tx => {
      await acquireResourceXactLock(tx, 'gdpr:tenant-erasure', tenantId);

      const rows = await tx
        .update(schema.tenants)
        .set({
          // What it was before the request, so cancelling an erasure never silently lifts an admin's suspension.
          status: sql`COALESCE(${schema.tenants.statusBeforeErasure}, ${TenantStatus.ACTIVE}::tenant_status)`,
          statusBeforeErasure: null,
          erasureRequestedAt: null,
          erasureRequestedByUserId: null,
          erasureReminderSentAt: null,
          lastErasureRequestedAt: sql`${schema.tenants.erasureRequestedAt}`,
          lastErasureCancelledAt: sql`now()`,
          updatedAt: sql`now()`,
        })
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
