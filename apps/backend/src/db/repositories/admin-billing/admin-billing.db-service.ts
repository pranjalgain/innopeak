import { Injectable } from '@nestjs/common';

import { AdminBillingRepository } from './admin-billing.repository';
import type {
  AdminBillingSummary,
  UpgradeTrendPoint,
  WebhookEventRow,
} from './types/admin-billing.type';

const AT_RISK_LIMIT = 10;

/** Composes `AdminBillingRepository`'s independent queries into the one payload the admin Billing
 *  page's whole first screen is built from — mirrors `AdminStatisticsDbService.getSummary()`'s own
 *  shape and reasoning. Webhook events are a separate, paginated concern — see
 *  `listWebhookEvents` below — not part of this one-shot summary. */
@Injectable()
export class AdminBillingDbService {
  constructor(private readonly adminBillingRepository: AdminBillingRepository) {}

  hasPaidTenants(): Promise<boolean> {
    return this.adminBillingRepository.hasPaidTenants();
  }

  async getSummary(monthsBack: number): Promise<AdminBillingSummary> {
    const [planSplit, statusCounts, cancelingCount, upgradeTrend, atRisk] = await Promise.all([
      this.adminBillingRepository.getPlanSplit(),
      this.adminBillingRepository.getSubscriptionStatusCounts(),
      this.adminBillingRepository.getCancelingCount(),
      this.adminBillingRepository.getUpgradeTrend(monthsBack),
      this.adminBillingRepository.getAtRiskSubscriptions(AT_RISK_LIMIT),
    ]);

    return {
      ...planSplit,
      ...statusCounts,
      cancelingCount,
      upgradeTrend: this.fillUpgradeTrendWindow(upgradeTrend, monthsBack),
      atRisk,
    };
  }

  listWebhookEvents(input: {
    page: number;
    pageSize: number;
    type?: string | undefined;
  }): Promise<{ events: WebhookEventRow[]; total: number }> {
    return this.adminBillingRepository.listWebhookEvents(input);
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
