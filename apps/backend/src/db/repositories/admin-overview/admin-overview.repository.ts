import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { count, desc, eq, gte, sql } from 'drizzle-orm';

export interface PlatformReviewStats {
  totalReviewsFetched: number;
  totalRepliesSent: number;
}

/** One calendar month's tenant-signup count. Only months with at least one signup are returned —
 * `AdminOverviewService.getSignupTrend` fills the zero-count months in the window before responding. */
export interface SignupTrendPoint {
  year: number;
  /** 1-12. */
  month: number;
  count: number;
}

export interface PlatformActivityRow {
  id: string;
  type: PlatformActivityType;
  actorEmail: string;
  businessName: string | null;
  targetEmail: string | null;
  occurredAt: string;
}

export interface RecordActivityInput {
  type: PlatformActivityType;
  actorPlatformAdminId: string;
  /** What the entry renders as its actor, snapshotted for the same reason `businessName` is — the
   * admin row it points at can be deleted, and "who did this" is the one field a log of admin
   * actions cannot afford to lose. Comes straight off the request's `AuthUser`. */
  actorEmail: string;
  tenantId?: string;
  /** Required for `business_*` types (the table's CHECK enforces it) — this is what the entry
   * renders, snapshotted so it survives the tenant being deleted or renamed. */
  businessName?: string;
  targetEmail?: string;
}

const ACTIVITY_COLUMNS = {
  id: schema.platformActivityLog.id,
  type: schema.platformActivityLog.type,
  actorEmail: schema.platformActivityLog.actorEmail,
  // The snapshot taken at write time, not a join against `tenants` — a joined name would vanish
  // when the business is deleted and would silently rewrite itself when the business is renamed.
  businessName: schema.platformActivityLog.businessName,
  targetEmail: schema.platformActivityLog.targetEmail,
  occurredAt: schema.platformActivityLog.occurredAt,
} as const;

/**
 * `reviews`/`review_responses` aggregated platform-wide (no `tenantId` filter — the one place in
 * this codebase those two tables are queried across every tenant at once), plus
 * `platform_activity_log`, a purpose-built log of platform-admin actions (see
 * `0009_admin_overview.sql` for why it's written explicitly rather than trigger-populated).
 */
@Injectable()
export class AdminOverviewRepository {
  constructor(private readonly dbService: DBService) {}

  async getReviewStats(): Promise<PlatformReviewStats> {
    const [reviewRows, replyRows] = await Promise.all([
      this.dbService.db.select({ value: count() }).from(schema.reviews),
      this.dbService.db
        .select({ value: count() })
        .from(schema.reviewResponses)
        .where(eq(schema.reviewResponses.status, ResponseStatus.POSTED)),
    ]);

    return {
      totalReviewsFetched: reviewRows[0]?.value ?? 0,
      totalRepliesSent: replyRows[0]?.value ?? 0,
    };
  }

  /**
   * Tenant signups aggregated by calendar month, over the trailing `monthsBack` months (the
   * current month counts as one). UTC, matching the app's `TZ=UTC` runtime, so a tenant created at
   * `2026-02-01T00:30:00Z` always lands in February regardless of which timezone the requesting
   * admin is in.
   *
   * `EXTRACT(...)` is the accepted `sql<T>` exception here (see `admin-businesses.repository.ts`'s
   * own comment on that convention) — the query builder has no month/year grouping primitive.
   * Reusing the same `sql<T>` expression objects in both `select` and `groupBy` keeps the two
   * provably identical; Postgres groups by the expression itself, not by its output alias.
   */
  async getSignupTrend(monthsBack: number): Promise<SignupTrendPoint[]> {
    const now = new Date();
    // `tenants.createdAt` is a `mode: 'string'` timestamp column — Drizzle compares it against a
    // string, not a `Date`, so the window start is serialized before being passed to `gte`.
    const windowStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1)
    ).toISOString();

    const yearExpr = sql<number>`EXTRACT(YEAR FROM ${schema.tenants.createdAt})::int`;
    const monthExpr = sql<number>`EXTRACT(MONTH FROM ${schema.tenants.createdAt})::int`;

    const rows = await this.dbService.db
      .select({ year: yearExpr, month: monthExpr, value: count() })
      .from(schema.tenants)
      .where(gte(schema.tenants.createdAt, windowStart))
      .groupBy(yearExpr, monthExpr);

    return rows.map(row => ({ year: row.year, month: row.month, count: row.value }));
  }

  async recordActivity(input: RecordActivityInput): Promise<void> {
    await this.dbService.db.insert(schema.platformActivityLog).values({
      type: input.type,
      actorPlatformAdminId: input.actorPlatformAdminId,
      actorEmail: input.actorEmail,
      tenantId: input.tenantId ?? null,
      businessName: input.businessName ?? null,
      targetEmail: input.targetEmail ?? null,
    });
  }

  async getRecentActivity(limit: number): Promise<PlatformActivityRow[]> {
    const rows = await this.dbService.db
      .select(ACTIVITY_COLUMNS)
      // No join to `platform_admins`: every column this returns is stored on the log row itself.
      // An inner join would also have silently dropped entries whose admin has since been deleted
      // — exactly the history the snapshot columns exist to preserve.
      .from(schema.platformActivityLog)
      .orderBy(desc(schema.platformActivityLog.occurredAt), desc(schema.platformActivityLog.id))
      .limit(limit);

    return rows as PlatformActivityRow[];
  }
}
