import { ReviewClassification } from '@common/enums/review-classification.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { count, gte, ne, sql } from 'drizzle-orm';

import type {
  ClassificationBreakdownRow,
  RatingDistributionRow,
  ReviewsTrendPoint,
  SyncHealthCounts,
} from './types/admin-statistics.type';

/** Platform-wide analytics: deliberately no tenantId filter. */
@Injectable()
export class AdminStatisticsRepository {
  constructor(private readonly dbService: DBService) {}

  async getAvgRating(): Promise<number> {
    const rows = await this.dbService.db
      .select({ value: sql<string | null>`AVG(${schema.reviews.rating})` })
      .from(schema.reviews);

    const raw = rows[0]?.value;
    return raw === null || raw === undefined ? 0 : Number(raw);
  }

  async getRatingDistribution(): Promise<RatingDistributionRow[]> {
    const rows = await this.dbService.db
      .select({ rating: schema.reviews.rating, value: count() })
      .from(schema.reviews)
      .groupBy(schema.reviews.rating);

    return rows.map(row => ({ rating: row.rating, count: row.value }));
  }

  async getClassificationBreakdown(): Promise<ClassificationBreakdownRow[]> {
    const rows = await this.dbService.db
      .select({ classification: schema.reviews.classification, value: count() })
      .from(schema.reviews)
      .groupBy(schema.reviews.classification);

    return rows.map(row => ({
      classification: row.classification as ReviewClassification,
      count: row.value,
    }));
  }

  /** Excludes `running` — a sync mid-flight is neither a success nor a failure yet. */
  async getSyncHealthCounts(): Promise<SyncHealthCounts> {
    const rows = await this.dbService.db
      .select({ status: schema.syncRuns.status, value: count() })
      .from(schema.syncRuns)
      .where(ne(schema.syncRuns.status, SyncRunStatus.RUNNING))
      .groupBy(schema.syncRuns.status);

    const counts: SyncHealthCounts = { ok: 0, error: 0 };
    for (const row of rows) {
      const status = row.status as SyncRunStatus;
      if (status === SyncRunStatus.OK) {
        counts.ok = row.value;
      } else if (status === SyncRunStatus.ERROR) {
        counts.error = row.value;
      }
    }
    return counts;
  }

  /**
   * Per UTC calendar month: reviews by `createdAt` (when synced) and replies by `postedAt` (when
   * Google received it, not when the draft was written). Two queries merged by month key, since a
   * month can post replies to reviews fetched earlier.
   */
  async getReviewsTrend(monthsBack: number): Promise<ReviewsTrendPoint[]> {
    const now = new Date();
    const windowStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1)
    ).toISOString();

    const reviewsYearExpr = sql<number>`EXTRACT(YEAR FROM ${schema.reviews.createdAt})::int`;
    const reviewsMonthExpr = sql<number>`EXTRACT(MONTH FROM ${schema.reviews.createdAt})::int`;
    const repliesYearExpr = sql<number>`EXTRACT(YEAR FROM ${schema.reviewResponses.postedAt})::int`;
    const repliesMonthExpr = sql<number>`EXTRACT(MONTH FROM ${schema.reviewResponses.postedAt})::int`;

    const [reviewRows, replyRows] = await Promise.all([
      this.dbService.db
        .select({ year: reviewsYearExpr, month: reviewsMonthExpr, value: count() })
        .from(schema.reviews)
        .where(gte(schema.reviews.createdAt, windowStart))
        .groupBy(reviewsYearExpr, reviewsMonthExpr),
      this.dbService.db
        .select({ year: repliesYearExpr, month: repliesMonthExpr, value: count() })
        .from(schema.reviewResponses)
        // Keyed on `posted_at`, not `status = 'posted'`: status can later become `superseded`,
        // which would retroactively shrink past months. `gte` already excludes NULL (unposted).
        .where(gte(schema.reviewResponses.postedAt, windowStart))
        .groupBy(repliesYearExpr, repliesMonthExpr),
    ]);

    const points = new Map<string, ReviewsTrendPoint>();
    for (const row of reviewRows) {
      const key = `${row.year}-${row.month}`;
      const existing = points.get(key);
      if (existing) {
        existing.reviewsFetched = row.value;
      } else {
        points.set(key, {
          year: row.year,
          month: row.month,
          reviewsFetched: row.value,
          repliesSent: 0,
        });
      }
    }
    for (const row of replyRows) {
      const key = `${row.year}-${row.month}`;
      const existing = points.get(key);
      if (existing) {
        existing.repliesSent = row.value;
      } else {
        points.set(key, {
          year: row.year,
          month: row.month,
          reviewsFetched: 0,
          repliesSent: row.value,
        });
      }
    }

    return Array.from(points.values());
  }
}
