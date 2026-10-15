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
  // The snapshot taken at write time, not a join against `tenants`: a joined name would vanish when the business is
  // deleted and silently change when it is renamed.
  businessName: schema.platformActivityLog.businessName,
  targetEmail: schema.platformActivityLog.targetEmail,
  details: schema.platformActivityLog.details,
  occurredAt: schema.platformActivityLog.occurredAt,
} as const;

/** Platform-wide aggregates (no `tenantId` filter) plus `platform_activity_log`; see `0009_admin_overview.sql` for why it's written explicitly. */
@Injectable()
export class AdminOverviewRepository {
  constructor(private readonly dbService: DBService) {}

  async getReviewStats(): Promise<PlatformReviewStats> {
    const [reviewRows, replyRows] = await Promise.all([
      this.dbService.db.select({ value: count() }).from(schema.reviews),
      // `posted_at IS NOT NULL`, not the mutable `status = 'posted'` (becomes `superseded` on edit): matches
      // `AdminStatisticsRepository.getReviewsTrend` so Overview and Statistics agree on "replies sent".
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
   * UTC (app runs `TZ=UTC`) so a signup's month never depends on the admin's timezone; the current month counts as one of
   * `monthsBack`. `EXTRACT(...)` is the accepted `sql<T>` exception; reusing the same expression objects in `select` and
   * `groupBy` keeps them identical, since Postgres groups by expression, not alias.
   */
  async getSignupTrend(monthsBack: number): Promise<SignupTrendPoint[]> {
    const now = new Date();
    // `createdAt` is a `mode: 'string'` column, so the window start is serialized before `gte`.
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
      details: input.details ?? null,
    });
  }

  async getRecentActivity(limit: number): Promise<PlatformActivityRow[]> {
    const rows = await this.dbService.db
      .select(ACTIVITY_COLUMNS)
      // No join to `platform_admins`: columns are snapshotted on the row, and an inner join would drop entries whose admin was deleted.
      .from(schema.platformActivityLog)
      .orderBy(desc(schema.platformActivityLog.occurredAt), desc(schema.platformActivityLog.id))
      .limit(limit);

    return rows as PlatformActivityRow[];
  }

  /** Paginated, filterable history of real `platform_activity_log` rows only; the synthesized `business_joined` entries aren't rows here. */
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
