import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { and, count, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

export interface RatingCountRow {
  rating: number;
  value: number;
}

/** Raw aggregates for the dashboard's stat cards, before `DashboardDbService` zero-fills `ratingCounts` into a 1-5 `ratingDistribution`. */
export interface DashboardMetricsRow {
  total: number;
  avgRating: number | null;
  pending: number;
  escalated: number;
  ratingCounts: RatingCountRow[];
}

export interface RecentEscalatedRow {
  id: string;
  reviewerName: string | null;
  rating: number;
  reviewText: string | null;
  escalationReason: EscalationReason | null;
  reviewedAt: string | null;
}

/** The already-decided scope every query in this repository runs against — see the class doc comment. */
export interface DashboardQueryScope {
  tenantId: string;
  locationIds: string[];
  openStatuses: ReviewStatus[];
}

const RECENT_ESCALATED_COLUMNS = {
  id: schema.reviews.id,
  reviewerName: schema.reviews.reviewerName,
  rating: schema.reviews.rating,
  reviewText: schema.reviews.reviewText,
  escalationReason: schema.reviews.escalationReason,
  reviewedAt: schema.reviews.reviewedAt,
} as const;

/**
 * Mechanical queries over `reviews`/`locations` for dashboard analytics — no policy of its own
 * (which statuses count as "open", which locations count when none is named, how the rating
 * distribution is zero-filled). That lives one layer up in `DashboardDbService`; every method
 * here takes the already-decided `locationIds`/`openStatuses` as plain parameters.
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Every currently-active, unpaused location id for a tenant — `DashboardDbService` calls this
   * both to resolve "no location named" into a concrete scope and to validate an explicitly named
   * one. `billing_paused_at IS NOT NULL` marks a location a downgrade pushed over the plan's cap
   * (`BillingEntitlementsService.enforceLocationLimitOnDowngrade`); excluding it here keeps
   * dashboard metrics/escalations in step with the same entitlement `ReviewsReadRepository`
   * enforces for the review queue — a tenant who no longer pays for a location shouldn't see its
   * numbers folded into (or standing in for) the dashboard either.
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
   * Aggregated raw counts for the dashboard's stat cards, plus the same window's per-rating
   * counts (not yet zero-filled — see `DashboardMetricsRow`). Merged into one method (and one
   * round trip) because every caller wants both for the same `days`/`tenantId`/`locationIds` set.
   *
   * `scope.locationIds` is the caller's already-resolved scope: `DashboardDbService.getMetrics`
   * decides whether that's one named location or every currently-active one. An empty array is a
   * meaningful input, not an error — `inArray` over `[]` matches no rows, correctly yielding
   * all-zero metrics for a tenant with no active locations.
   */
  async getMetrics(days: number, scope: DashboardQueryScope): Promise<DashboardMetricsRow> {
    const inWindow = this.windowedTenantReviews(days, scope);
    const open = this.openTenantReviews(scope);

    const [totalRows, avgRows, pendingRows, escalatedRows, distributionRows] = await Promise.all([
      this.dbService.db.select({ value: count() }).from(schema.reviews).where(inWindow),
      this.dbService.db
        // `::float` is load-bearing: AVG() over an integer column yields `numeric`, which
        // node-postgres returns as a *string* to protect precision that a rating average does not
        // need. Left uncast, this field is declared `number` and is a string at runtime, so a
        // consumer calling `.toFixed()` on it throws.
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

  /**
   * The most recently reviewed escalations still awaiting action, newest first, within the
   * caller-resolved `scope.locationIds` — see `getMetrics`'s doc comment on that parameter.
   */
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
      // `id` breaks ties — a uuidv7 sorts by creation time, keeping the order stable across the
      // whole page of reviews a backfill can land in the same second.
      .orderBy(desc(schema.reviews.reviewedAt), desc(schema.reviews.id))
      .limit(limit);

    // Drizzle infers `escalation_reason` as its own plain string-literal union rather than the
    // app-level enum; bridging that at the repository boundary is the same convention
    // `ReviewsReadRepository` follows, and the literal values are guaranteed identical because the
    // migration and the enum both declare them.
    return rows as RecentEscalatedRow[];
  }

  /**
   * Reviews belonging to `tenantId`, scoped to `locationIds`, that the reviewer left inside the
   * trailing `days` window.
   *
   * Windowed on `reviewed_at`, not `created_at`: `created_at` is the row's insert time and the
   * sync leaves it at `defaultNow()`, so an onboarding backfill stamps a business's entire review
   * history with today's date. Filtering on it would report years of imported reviews as having
   * arrived in the last 7 days, and would make every range in the selector return the same
   * number. `reviewed_at` is nullable and `gt` excludes NULLs — correct here, since a review with
   * no date cannot be placed in a window.
   */
  private windowedTenantReviews(days: number, scope: DashboardQueryScope): SQL | undefined {
    return and(
      eq(schema.reviews.tenantId, scope.tenantId),
      gt(schema.reviews.reviewedAt, sql`now() - make_interval(days => ${days})`),
      inArray(schema.reviews.locationId, scope.locationIds)
    );
  }

  /** Reviews belonging to `scope.tenantId`, scoped to `scope.locationIds`, whose status is in `scope.openStatuses` — shared between the `pending`/`escalated` stat cards. */
  private openTenantReviews(scope: DashboardQueryScope): SQL | undefined {
    return and(
      eq(schema.reviews.tenantId, scope.tenantId),
      inArray(schema.reviews.status, scope.openStatuses),
      inArray(schema.reviews.locationId, scope.locationIds)
    );
  }
}
