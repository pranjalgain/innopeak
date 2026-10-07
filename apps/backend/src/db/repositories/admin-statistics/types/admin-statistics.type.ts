import type { ReviewClassification } from '@common/enums/review-classification.enum';

/** The repository returns only non-zero months; `AdminStatisticsDbService` zero-fills. */
export interface ReviewsTrendPoint {
  year: number;
  /** 1-12. */
  month: number;
  reviewsFetched: number;
  repliesSent: number;
}

export interface RatingDistributionRow {
  rating: number;
  count: number;
}

export interface ClassificationBreakdownRow {
  classification: ReviewClassification;
  count: number;
}

export interface SyncHealthCounts {
  ok: number;
  error: number;
}

export interface ConnectionHealthCounts {
  connected: number;
  needsReauth: number;
  disconnected: number;
  neverConnected: number;
}

export interface AdminStatisticsSummary {
  replyRatePercent: number;
  avgRating: number;
  syncSuccessRatePercent: number;
  connectionHealth: ConnectionHealthCounts;
  reviewsTrend: ReviewsTrendPoint[];
  ratingDistribution: RatingDistributionRow[];
  classificationBreakdown: ClassificationBreakdownRow[];
}
