import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

export interface PlanSplitCounts {
  freeCount: number;
  paidCount: number;
}

export interface SubscriptionStatusCounts {
  activeCount: number;
  pastDueCount: number;
  canceledCount: number;
  incompleteCount: number;
}

/** One calendar month's Free→Paid conversions — counted from `stripe_webhook_events` rows of type
 *  `checkout.session.completed` (the one event this app's webhook handler ever upgrades a tenant
 *  on), same "only non-zero months returned" contract as `SignupTrendPoint`. */
export interface UpgradeTrendPoint {
  year: number;
  /** 1-12. */
  month: number;
  count: number;
}

export interface AtRiskSubscriptionRow {
  tenantId: string;
  businessName: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
}

export interface WebhookEventRow {
  id: string;
  type: string;
  processedAt: string;
}

const CHECKOUT_COMPLETED_EVENT_TYPE = 'checkout.session.completed';

/**
 * `billing_plans`/`tenant_subscriptions`/`stripe_webhook_events` aggregated platform-wide for the
 * admin Billing page — the one place any of these three tables gets an admin-facing read; every
 * other reader is tenant-scoped (`BillingService`/`BillingWebhooksService`).
 */
@Injectable()
export class AdminBillingRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * A cheap existence check, not `getPlanSplit()` with the count discarded — that one does a full
   * `GROUP BY count()` over every tenant, real overhead for what the admin frontend calls on
   * every `/admin/*` page load just to decide whether the Billing nav item should still show
   * while `PAYMENT_FEATURE_ENABLED` is off (see `AdminBillingService.hasPaidTenants`'s own
   * comment for why that matters). `LIMIT 1` on an indexed equality lookup is effectively free
   * regardless of how many tenants exist.
   */
  async hasPaidTenants(): Promise<boolean> {
    const rows = await this.dbService.db
      .select({ id: schema.tenantSubscriptions.id })
      .from(schema.tenantSubscriptions)
      .innerJoin(schema.billingPlans, eq(schema.tenantSubscriptions.planId, schema.billingPlans.id))
      .where(eq(schema.billingPlans.code, BillingPlanCode.PAID))
      .limit(1);

    return rows.length > 0;
  }

  async getPlanSplit(): Promise<PlanSplitCounts> {
    const rows = await this.dbService.db
      .select({ code: schema.billingPlans.code, value: count() })
      .from(schema.tenantSubscriptions)
      .innerJoin(schema.billingPlans, eq(schema.tenantSubscriptions.planId, schema.billingPlans.id))
      .groupBy(schema.billingPlans.code);

    const counts: PlanSplitCounts = { freeCount: 0, paidCount: 0 };
    for (const row of rows) {
      const code = row.code as BillingPlanCode;
      if (code === BillingPlanCode.FREE) {
        counts.freeCount = row.value;
      } else {
        counts.paidCount = row.value;
      }
    }
    return counts;
  }

  /** `status` is `NULL` for a pure-Free tenant that has never started a Stripe checkout — those
   *  rows are excluded here rather than folded into any bucket, since "no subscription object
   *  yet" isn't any of the four real Stripe statuses. */
  async getSubscriptionStatusCounts(): Promise<SubscriptionStatusCounts> {
    const rows = await this.dbService.db
      .select({ status: schema.tenantSubscriptions.status, value: count() })
      .from(schema.tenantSubscriptions)
      .where(sql`${schema.tenantSubscriptions.status} IS NOT NULL`)
      .groupBy(schema.tenantSubscriptions.status);

    const counts: SubscriptionStatusCounts = {
      activeCount: 0,
      pastDueCount: 0,
      canceledCount: 0,
      incompleteCount: 0,
    };
    for (const row of rows) {
      switch (row.status as SubscriptionStatus | null) {
        case SubscriptionStatus.ACTIVE:
          counts.activeCount = row.value;
          break;
        case SubscriptionStatus.PAST_DUE:
          counts.pastDueCount = row.value;
          break;
        case SubscriptionStatus.CANCELED:
          counts.canceledCount = row.value;
          break;
        case SubscriptionStatus.INCOMPLETE:
          counts.incompleteCount = row.value;
          break;
        default:
          break;
      }
    }
    return counts;
  }

  async getCancelingCount(): Promise<number> {
    const rows = await this.dbService.db
      .select({ value: count() })
      .from(schema.tenantSubscriptions)
      .where(eq(schema.tenantSubscriptions.cancelAtPeriodEnd, true));

    return rows[0]?.value ?? 0;
  }

  async getUpgradeTrend(monthsBack: number): Promise<UpgradeTrendPoint[]> {
    const now = new Date();
    const windowStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1)
    ).toISOString();

    const yearExpr = sql<number>`EXTRACT(YEAR FROM ${schema.stripeWebhookEvents.processedAt})::int`;
    const monthExpr = sql<number>`EXTRACT(MONTH FROM ${schema.stripeWebhookEvents.processedAt})::int`;

    const rows = await this.dbService.db
      .select({ year: yearExpr, month: monthExpr, value: count() })
      .from(schema.stripeWebhookEvents)
      .where(
        and(
          eq(schema.stripeWebhookEvents.type, CHECKOUT_COMPLETED_EVENT_TYPE),
          gte(schema.stripeWebhookEvents.processedAt, windowStart)
        )
      )
      .groupBy(yearExpr, monthExpr);

    return rows.map(row => ({ year: row.year, month: row.month, count: row.value }));
  }

  async getAtRiskSubscriptions(limit: number): Promise<AtRiskSubscriptionRow[]> {
    const rows = await this.dbService.db
      .select({
        tenantId: schema.tenantSubscriptions.tenantId,
        businessName: schema.tenants.name,
        status: schema.tenantSubscriptions.status,
        currentPeriodEnd: schema.tenantSubscriptions.currentPeriodEnd,
      })
      .from(schema.tenantSubscriptions)
      .innerJoin(schema.tenants, eq(schema.tenantSubscriptions.tenantId, schema.tenants.id))
      .where(eq(schema.tenantSubscriptions.status, SubscriptionStatus.PAST_DUE))
      .orderBy(desc(schema.tenantSubscriptions.updatedAt))
      .limit(limit);

    return rows as AtRiskSubscriptionRow[];
  }

  async getRecentWebhookEvents(limit: number): Promise<WebhookEventRow[]> {
    const rows = await this.dbService.db
      .select({
        id: schema.stripeWebhookEvents.id,
        type: schema.stripeWebhookEvents.type,
        processedAt: schema.stripeWebhookEvents.processedAt,
      })
      .from(schema.stripeWebhookEvents)
      .orderBy(desc(schema.stripeWebhookEvents.processedAt))
      .limit(limit);

    return rows;
  }
}
