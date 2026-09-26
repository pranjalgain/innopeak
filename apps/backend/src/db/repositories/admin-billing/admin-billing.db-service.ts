import { Injectable } from '@nestjs/common';

import {
  AdminBillingRepository,
  type AtRiskSubscriptionRow,
  type UpgradeTrendPoint,
  type WebhookEventRow,
} from './admin-billing.repository';

export interface AdminBillingSummary {
  freeCount: number;
  paidCount: number;
  activeCount: number;
  pastDueCount: number;
  canceledCount: number;
  incompleteCount: number;
  cancelingCount: number;
  upgradeTrend: UpgradeTrendPoint[];
  atRisk: AtRiskSubscriptionRow[];
  recentWebhookEvents: WebhookEventRow[];
}

const AT_RISK_LIMIT = 10;
const RECENT_WEBHOOK_EVENTS_LIMIT = 10;

/** Composes `AdminBillingRepository`'s independent queries into the one payload the admin Billing
 *  page's whole first screen is built from — mirrors `AdminStatisticsDbService.getSummary()`'s own
 *  shape and reasoning. */
@Injectable()
export class AdminBillingDbService {
  constructor(private readonly adminBillingRepository: AdminBillingRepository) {}

  hasPaidTenants(): Promise<boolean> {
    return this.adminBillingRepository.hasPaidTenants();
  }

  async getSummary(monthsBack: number): Promise<AdminBillingSummary> {
    const [planSplit, statusCounts, cancelingCount, upgradeTrend, atRisk, recentWebhookEvents] =
      await Promise.all([
        this.adminBillingRepository.getPlanSplit(),
        this.adminBillingRepository.getSubscriptionStatusCounts(),
        this.adminBillingRepository.getCancelingCount(),
        this.adminBillingRepository.getUpgradeTrend(monthsBack),
        this.adminBillingRepository.getAtRiskSubscriptions(AT_RISK_LIMIT),
        this.adminBillingRepository.getRecentWebhookEvents(RECENT_WEBHOOK_EVENTS_LIMIT),
      ]);

    return {
      ...planSplit,
      ...statusCounts,
      cancelingCount,
      upgradeTrend: this.fillUpgradeTrendWindow(upgradeTrend, monthsBack),
      atRisk,
      recentWebhookEvents,
    };
  }

  /** Same zero-fill reasoning as `fillSignupTrendWindow` (`admin-overview`'s own util) — a month
   *  with no upgrades must render as a real zero bar, not be skipped and drawn as if adjacent to
   *  the next month that does have one. */
  private fillUpgradeTrendWindow(
    points: UpgradeTrendPoint[],
    monthsBack: number
  ): UpgradeTrendPoint[] {
    const counts = new Map<string, number>();
    for (const point of points) {
      counts.set(`${point.year}-${point.month}`, point.count);
    }

    const now = new Date();
    const window: UpgradeTrendPoint[] = [];
    for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      window.push({ year, month, count: counts.get(`${year}-${month}`) ?? 0 });
    }
    return window;
  }
}
