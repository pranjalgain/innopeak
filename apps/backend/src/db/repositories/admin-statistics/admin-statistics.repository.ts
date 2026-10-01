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

/**
 * Platform-wide review/sync analytics for the admin Statistics page — `reviews`/`review_responses`/
 * `sync_runs` aggregated across every tenant, the same "no tenantId filter" scope
 * `AdminOverviewRepository.getReviewStats()` already uses for its own headline counts.
 */
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
   * Reviews fetched (by `reviews.createdAt`, when this app synced it) and replies actually posted
   * (by `review_responses.postedAt`, when Google received it — not `createdAt`, which is when the
   * draft was written) bucketed by calendar month, UTC. Two independent queries rather than one
   * joined query: `reviews`/`review_responses` have no shared grain to join on for this purpose
   * (a month can post replies to reviews fetched in an earlier month), so `AdminStatisticsDbService`
   * merges the two series by month key instead.
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
        // Keyed on `posted_at` alone, not `status = 'posted'`. `posted_at` is only ever written
        // when a reply actually reached Google, and it is never cleared — whereas `status` is
        // mutable (`ResponseStatus`'s own doc: `posted -> superseded on a later edit`), so
        // filtering on it would let a past month's bar shrink months later, retroactively
        // rewriting a historical chart. `gte` already excludes the NULLs, so no status filter is
        // needed to keep unposted drafts out.
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
