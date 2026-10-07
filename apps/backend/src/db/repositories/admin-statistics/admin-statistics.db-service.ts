import { BusinessConnectionStatus } from '@common/enums/business-connection-status.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { AdminBusinessesDbService } from '@db/repositories/admin-businesses/admin-businesses.db-service';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { Injectable } from '@nestjs/common';

import { AdminStatisticsRepository } from './admin-statistics.repository';
import type {
  AdminStatisticsSummary,
  ClassificationBreakdownRow,
  ConnectionHealthCounts,
  RatingDistributionRow,
  ReviewsTrendPoint,
} from './types/admin-statistics.type';

const ALL_RATINGS = [1, 2, 3, 4, 5] as const;
const ALL_CLASSIFICATIONS = Object.values(ReviewClassification);

@Injectable()
export class AdminStatisticsDbService {
  constructor(
    private readonly adminStatisticsRepository: AdminStatisticsRepository,
    private readonly adminOverviewDbService: AdminOverviewDbService,
    private readonly adminBusinessesDbService: AdminBusinessesDbService
  ) {}

  async getSummary(monthsBack: number): Promise<AdminStatisticsSummary> {
    const [
      reviewStats,
      avgRating,
      ratingDistribution,
      classificationBreakdown,
      syncHealth,
      connectionStatuses,
      reviewsTrend,
    ] = await Promise.all([
      this.adminOverviewDbService.getReviewStats(),
      this.adminStatisticsRepository.getAvgRating(),
      this.adminStatisticsRepository.getRatingDistribution(),
      this.adminStatisticsRepository.getClassificationBreakdown(),
      this.adminStatisticsRepository.getSyncHealthCounts(),
      this.adminBusinessesDbService.listConnectionStatuses(),
      this.adminStatisticsRepository.getReviewsTrend(monthsBack),
    ]);

    const replyRatePercent =
      reviewStats.totalReviewsFetched === 0
        ? 0
        : (reviewStats.totalRepliesSent / reviewStats.totalReviewsFetched) * 100;

    const syncTotal = syncHealth.ok + syncHealth.error;
    const syncSuccessRatePercent = syncTotal === 0 ? 0 : (syncHealth.ok / syncTotal) * 100;

    const connectionHealth: ConnectionHealthCounts = {
      connected: 0,
      needsReauth: 0,
      disconnected: 0,
      neverConnected: 0,
    };
    for (const connectionStatus of connectionStatuses) {
      switch (connectionStatus) {
        case BusinessConnectionStatus.CONNECTED:
          connectionHealth.connected += 1;
          break;
        case BusinessConnectionStatus.NEEDS_REAUTH:
          connectionHealth.needsReauth += 1;
          break;
        case BusinessConnectionStatus.DISCONNECTED:
          connectionHealth.disconnected += 1;
          break;
        case BusinessConnectionStatus.NEVER_CONNECTED:
          connectionHealth.neverConnected += 1;
          break;
      }
    }

    return {
      replyRatePercent,
      avgRating,
      syncSuccessRatePercent,
      connectionHealth,
      reviewsTrend: this.fillReviewsTrendWindow(reviewsTrend, monthsBack),
      ratingDistribution: this.fillRatingDistribution(ratingDistribution),
      classificationBreakdown: this.fillClassificationBreakdown(classificationBreakdown),
    };
  }

  /** Zero-fills so an empty month renders as a real zero rather than being skipped. */
  private fillReviewsTrendWindow(
    points: ReviewsTrendPoint[],
    monthsBack: number
  ): ReviewsTrendPoint[] {
    const byKey = new Map<string, ReviewsTrendPoint>();
    for (const point of points) {
      byKey.set(`${point.year}-${point.month}`, point);
    }

    const now = new Date();
    const window: ReviewsTrendPoint[] = [];
    for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const existing = byKey.get(`${year}-${month}`);
      window.push(existing ?? { year, month, reviewsFetched: 0, repliesSent: 0 });
    }
    return window;
  }

  /** The repository omits unused ratings; the histogram needs every 1-5 bar, at zero. */
  private fillRatingDistribution(rows: RatingDistributionRow[]): RatingDistributionRow[] {
    const byRating = new Map(rows.map(row => [row.rating, row.count]));
    return ALL_RATINGS.map(rating => ({ rating, count: byRating.get(rating) ?? 0 }));
  }

  private fillClassificationBreakdown(
    rows: ClassificationBreakdownRow[]
  ): ClassificationBreakdownRow[] {
    const byClassification = new Map(rows.map(row => [row.classification, row.count]));
    return ALL_CLASSIFICATIONS.map(classification => ({
      classification,
      count: byClassification.get(classification) ?? 0,
    }));
  }
}
