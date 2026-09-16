import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { and, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';

export interface DashboardMetrics {
  total: number;
  avgRating: number | null;
  pending: number;
  escalated: number;
  ratingDistribution: Record<number, number>;
}

export interface RecentEscalatedRow {
  id: string;
  reviewerName: string | null;
  rating: number;
  reviewText: string | null;
  escalationReason: EscalationReason | null;
  reviewedAt: string | null;
}

/** A review is "open" while it still needs someone to act on it. `responded` and `dismissed` are
 * both terminal, so neither belongs in a backlog count. */
const OPEN_STATUSES = [ReviewStatus.NEW, ReviewStatus.IN_REVIEW];

const RECENT_ESCALATED_COLUMNS = {
  id: schema.reviews.id,
  reviewerName: schema.reviews.reviewerName,
  rating: schema.reviews.rating,
  reviewText: schema.reviews.reviewText,
  escalationReason: schema.reviews.escalationReason,
  reviewedAt: schema.reviews.reviewedAt,
} as const;

/**
 * Repository for dashboard analytics.
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Aggregated metrics for the dashboard's stat cards, plus the same window's rating distribution.
   *
   * `total`, `avgRating` and `ratingDistribution` are windowed; `pending` and `escalated` are not
   * — see MetricsDto, which documents why each card counts what it counts. Merged into one method
   * (and one round trip) because every caller wants both for the same `days`/`tenantId` pair.
   *
   * `locationId` is optional and additive, same as `ReviewsReadRepository.listReviews`'s own
   * filter: omitted means every location the tenant has confirmed, aggregated together — the
   * behavior this method always had before multi-location existed.
   */
  async getMetrics(days: number, tenantId: string, locationId?: string): Promise<DashboardMetrics> {
    const inWindow = this.windowedTenantReviews(days, tenantId, locationId);
    const open = this.openTenantReviews(tenantId, locationId);

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

    // Zero-filled first so every bucket exists even for an empty window — the client renders five
    // bars unconditionally — then overlaid with the rows that came back.
    const ratingDistribution: Record<number, number> = {};
    for (let rating = 1; rating <= 5; rating++) {
      ratingDistribution[rating] = 0;
    }
    for (const row of distributionRows) {
      ratingDistribution[row.rating] = row.value;
    }

    return {
      total: totalRows[0]?.value ?? 0,
      avgRating: avgRows[0]?.avgRating ?? null,
      pending: pendingRows[0]?.value ?? 0,
      escalated: escalatedRows[0]?.value ?? 0,
      ratingDistribution,
    };
  }

  /**
   * The most recently reviewed escalations still awaiting action, newest first.
   */
  async getRecentEscalated(
    limit: number,
    tenantId: string,
    locationId?: string
  ): Promise<RecentEscalatedRow[]> {
    const conditions = [
      eq(schema.reviews.tenantId, tenantId),
      eq(schema.reviews.classification, ReviewClassification.ESCALATED),
      inArray(schema.reviews.status, OPEN_STATUSES),
      this.locationScope(tenantId, locationId),
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
   * Reviews belonging to `tenantId` (and, if given, scoped to one `locationId`) that the reviewer
   * left inside the trailing `days` window.
   *
   * Windowed on `reviewed_at`, not `created_at`: `created_at` is the row's insert time and the
   * sync leaves it at `defaultNow()`, so an onboarding backfill stamps a business's entire review
   * history with today's date. Filtering on it would report years of imported reviews as having
   * arrived in the last 7 days, and would make every range in the selector return the same
   * number. `reviewed_at` is nullable and `gt` excludes NULLs — correct here, since a review with
   * no date cannot be placed in a window.
   */
  private windowedTenantReviews(
    days: number,
    tenantId: string,
    locationId?: string
  ): SQL | undefined {
    const conditions = [
      eq(schema.reviews.tenantId, tenantId),
      gt(schema.reviews.reviewedAt, sql`now() - make_interval(days => ${days})`),
      this.locationScope(tenantId, locationId),
    ];
    return and(...conditions);
  }

  /**
   * Which locations' reviews count toward a figure: one named location, or — when none is named —
   * every location the tenant *currently* has, not every location it has ever had.
   *
   * `reviews.tenant_id` alone was the old answer, and it silently included deactivated ones. A
   * tenant that disconnects and reconnects under a different Google account gets fresh `locations`
   * rows (the upsert's conflict target is `(provider_connection_id, external_location_id)`, and
   * the connection id changed), so the same business's reviews are imported a second time under a
   * new `location_id` while the originals linger on the deactivated row. Every un-scoped total —
   * review count, pending, escalated, the rating distribution — then read roughly double, for a
   * location the Business Switcher no longer offers and the tenant cannot get back to.
   */
  private locationScope(tenantId: string, locationId?: string): SQL | undefined {
    if (locationId) {
      return eq(schema.reviews.locationId, locationId);
    }

    return inArray(
      schema.reviews.locationId,
      this.dbService.db
        .select({ id: schema.locations.id })
        .from(schema.locations)
        .where(
          and(
            eq(schema.locations.tenantId, tenantId),
            eq(schema.locations.status, LocationStatus.ACTIVE)
          )
        )
    );
  }

  /** Reviews belonging to `tenantId` (and, if given, scoped to one `locationId`) that still need
   *  someone to act on them — shared between the `pending`/`escalated` stat cards. */
  private openTenantReviews(tenantId: string, locationId?: string): SQL | undefined {
    const conditions = [
      eq(schema.reviews.tenantId, tenantId),
      inArray(schema.reviews.status, OPEN_STATUSES),
      this.locationScope(tenantId, locationId),
    ];
    return and(...conditions);
  }
}
