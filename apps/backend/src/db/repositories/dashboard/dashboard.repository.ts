import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { and, count, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

import type {
  DashboardMetricsRow,
  DashboardQueryScope,
  RecentEscalatedRow,
} from './types/dashboard.type';

const RECENT_ESCALATED_COLUMNS = {
  id: schema.reviews.id,
  reviewerName: schema.reviews.reviewerName,
  rating: schema.reviews.rating,
  reviewText: schema.reviews.reviewText,
  escalationReason: schema.reviews.escalationReason,
  reviewedAt: schema.reviews.reviewedAt,
} as const;

/**
 * Mechanical queries over `reviews`/`locations`; the policy (open statuses, location scope,
 * zero-filling) lives in `DashboardDbService`, so methods take already-decided parameters.
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Every active, unpaused location id for a tenant. `billing_paused_at IS NOT NULL` marks a
   * location a downgrade pushed over the plan's cap
   * (`BillingEntitlementsService.enforceLocationLimitOnDowngrade`); excluding it keeps the
   * dashboard in step with the entitlement `ReviewsReadRepository` enforces for the review queue.
   */
  async findActiveLocationIds(tenantId: string): Promise<string[]> {
    const rows = await this.dbService.db
      .select({ id: schema.locations.id })
      .from(schema.locations)
      .where(
        and(
          eq(schema.locations.tenantId, tenantId),
          eq(schema.locations.status, LocationStatus.ACTIVE),
          isNull(schema.locations.billingPausedAt)
        )
      );

    return rows.map(row => row.id);
  }

  /**
   * Raw counts for the stat cards plus the window's per-rating counts (not zero-filled), in one
   * round trip because callers want both. An empty `scope.locationIds` is meaningful, not an error:
   * `inArray` over `[]` matches nothing, yielding all-zero metrics.
   */
  async getMetrics(days: number, scope: DashboardQueryScope): Promise<DashboardMetricsRow> {
    const inWindow = this.windowedTenantReviews(days, scope);
    const open = this.openTenantReviews(scope);

    const [totalRows, avgRows, pendingRows, escalatedRows, distributionRows] = await Promise.all([
      this.dbService.db.select({ value: count() }).from(schema.reviews).where(inWindow),
      this.dbService.db
        // `::float` is load-bearing: AVG() over an integer yields `numeric`, which node-postgres
        // returns as a string, so `.toFixed()` on the declared `number` would throw.
        .select({ avgRating: sql<number | null>`AVG(${schema.reviews.rating})::float` })
        .from(schema.reviews)
        .where(inWindow),
      this.dbService.db.select({ value: count() }).from(schema.reviews).where(open),
      this.dbService.db
        .select({ value: count() })
        .from(schema.reviews)
        .where(and(open, eq(schema.reviews.classification, ReviewClassification.ESCALATED))),
      this.dbService.db
        .select({ rating: schema.reviews.rating, value: count() })
        .from(schema.reviews)
        .where(inWindow)
        .groupBy(schema.reviews.rating),
    ]);

    return {
      total: totalRows[0]?.value ?? 0,
      avgRating: avgRows[0]?.avgRating ?? null,
      pending: pendingRows[0]?.value ?? 0,
      escalated: escalatedRows[0]?.value ?? 0,
      ratingCounts: distributionRows,
    };
  }

  /** Newest first, within the caller-resolved `scope.locationIds`. */
  async getRecentEscalated(
    limit: number,
    scope: DashboardQueryScope
  ): Promise<RecentEscalatedRow[]> {
    const conditions = [
      eq(schema.reviews.tenantId, scope.tenantId),
      eq(schema.reviews.classification, ReviewClassification.ESCALATED),
      inArray(schema.reviews.status, scope.openStatuses),
      inArray(schema.reviews.locationId, scope.locationIds),
    ];

    const rows = await this.dbService.db
      .select(RECENT_ESCALATED_COLUMNS)
      .from(schema.reviews)
      .where(and(...conditions))
      // `id` breaks ties: a uuidv7 sorts by creation time, keeping order stable across reviews a
      // backfill lands in the same second.
      .orderBy(desc(schema.reviews.reviewedAt), desc(schema.reviews.id))
      .limit(limit);

    // Drizzle infers `escalation_reason` as a plain string-literal union rather than the app enum;
    // the values are identical, so it is bridged here (same convention as `ReviewsReadRepository`).
    return rows as RecentEscalatedRow[];
  }

  /**
   * Windowed on `reviewed_at`, not `created_at`: the sync leaves `created_at` at `defaultNow()`, so
   * an onboarding backfill would stamp a business's whole history with today and report it as
   * arriving in the last 7 days. `gt` excludes NULL `reviewed_at`, which is right since an undated
   * review has no place in a window.
   */
  private windowedTenantReviews(days: number, scope: DashboardQueryScope): SQL | undefined {
    return and(
      eq(schema.reviews.tenantId, scope.tenantId),
      gt(schema.reviews.reviewedAt, sql`now() - make_interval(days => ${days})`),
      inArray(schema.reviews.locationId, scope.locationIds)
    );
  }

  /** Shared by the `pending` and `escalated` stat cards. */
  private openTenantReviews(scope: DashboardQueryScope): SQL | undefined {
    return and(
      eq(schema.reviews.tenantId, scope.tenantId),
      inArray(schema.reviews.status, scope.openStatuses),
      inArray(schema.reviews.locationId, scope.locationIds)
    );
  }
}
