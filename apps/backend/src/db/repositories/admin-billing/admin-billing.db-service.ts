import { Injectable } from '@nestjs/common';

import { AdminBillingRepository } from './admin-billing.repository';
import type {
  AdminBillingSummary,
  UpgradeTrendPoint,
  WebhookEventRow,
} from './types/admin-billing.type';

const AT_RISK_LIMIT = 10;
const POST_ERASURE_CHARGES_LIMIT = 20;

/** Composes the repository's queries into the one payload the admin Billing first screen needs; webhook events are paginated separately. */
@Injectable()
export class AdminBillingDbService {
  constructor(private readonly adminBillingRepository: AdminBillingRepository) {}

  hasPaidTenants(): Promise<boolean> {
    return this.adminBillingRepository.hasPaidTenants();
  }

  async getSummary(monthsBack: number): Promise<AdminBillingSummary> {
    const [planSplit, statusCounts, cancelingCount, upgradeTrend, atRisk, postErasureCharges] =
      await Promise.all([
        this.adminBillingRepository.getPlanSplit(),
        this.adminBillingRepository.getSubscriptionStatusCounts(),
        this.adminBillingRepository.getCancelingCount(),
        this.adminBillingRepository.getUpgradeTrend(monthsBack),
        this.adminBillingRepository.getAtRiskSubscriptions(AT_RISK_LIMIT),
        this.adminBillingRepository.getUnresolvedPostErasureCharges(POST_ERASURE_CHARGES_LIMIT),
      ]);

    return {
      ...planSplit,
      ...statusCounts,
      cancelingCount,
      upgradeTrend: this.fillUpgradeTrendWindow(upgradeTrend, monthsBack),
      atRisk,
      postErasureCharges,
    };
  }

  resolvePostErasureCharge(input: { receiptId: string; adminId: string }): Promise<boolean> {
    return this.adminBillingRepository.resolvePostErasureCharge(input);
  }

  listWebhookEvents(input: {
    page: number;
    pageSize: number;
    type?: string | undefined;
  }): Promise<{ events: WebhookEventRow[]; total: number }> {
    return this.adminBillingRepository.listWebhookEvents(input);
  }

  /** Zero-fills months so one with no upgrades renders as a real zero bar instead of being skipped. */
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
