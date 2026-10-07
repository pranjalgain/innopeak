import type { EscalationReason } from '@common/enums/escalation-reason.enum';
import type { ReviewStatus } from '@common/enums/review-status.enum';

export interface RatingCountRow {
  rating: number;
  value: number;
}

/**
 * Raw aggregates, before `DashboardDbService` zero-fills `ratingCounts` into a 1-5
 * `ratingDistribution`.
 */
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

/** The already-decided scope every repository query runs against. */
export interface DashboardQueryScope {
  tenantId: string;
  locationIds: string[];
  openStatuses: ReviewStatus[];
}

export interface DashboardMetrics {
  total: number;
  avgRating: number | null;
  pending: number;
  escalated: number;
  ratingDistribution: Record<number, number>;
}

/** One named location, or every currently-active one when `locationId` is omitted. */
export interface DashboardScopeInput {
  tenantId: string;
  locationId?: string | undefined;
}
