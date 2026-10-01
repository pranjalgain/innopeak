import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { count, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';

import type {
  PlatformActivityRow,
  PlatformReviewStats,
  RecordActivityInput,
  SignupTrendPoint,
} from './types/admin-overview.type';

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
      // `posted_at IS NOT NULL`, not `status = 'posted'` — kept identical to
      // `AdminStatisticsRepository.getReviewsTrend`'s own filter so the Overview headline and the
      // Statistics trend can never disagree about what "replies sent" counts. See that method for
      // why the mutable `status` is the wrong key (`posted -> superseded on a later edit`).
      this.dbService.db
        .select({ value: count() })
        .from(schema.reviewResponses)
        .where(isNotNull(schema.reviewResponses.postedAt)),
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

  /**
   * Paginated, filterable history — distinct from `getRecentActivity` above (a bounded "top N"
   * read for the Overview glance card, no offset/total/type filter). Real `platform_activity_log`
   * rows only: the Overview card's synthesized `business_joined` entries (see
   * `buildActivityFeed` on the frontend) aren't a real row here and aren't part of this table, so
   * they're deliberately out of scope for this method — see this session's own research into why
   * paginating a UNION of two independently-queried sources isn't attempted here.
   */
  async listActivity(input: {
    page: number;
    pageSize: number;
    type?: PlatformActivityType | undefined;
  }): Promise<{ activities: PlatformActivityRow[]; total: number }> {
    const where = input.type ? eq(schema.platformActivityLog.type, input.type) : undefined;

    const [rows, totals] = await Promise.all([
      this.dbService.db
        .select(ACTIVITY_COLUMNS)
        .from(schema.platformActivityLog)
        .where(where)
        .orderBy(desc(schema.platformActivityLog.occurredAt), desc(schema.platformActivityLog.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.dbService.db.select({ value: count() }).from(schema.platformActivityLog).where(where),
    ]);

    return { activities: rows as PlatformActivityRow[], total: totals[0]?.value ?? 0 };
  }
}
