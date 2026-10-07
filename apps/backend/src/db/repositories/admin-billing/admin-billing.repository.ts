import { HANDLED_STRIPE_EVENT_TYPES, StripeWebhookEventType } from '@billing/types/billing.type';
import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';

import type {
  AtRiskSubscriptionRow,
  PlanSplitCounts,
  PostErasureChargeRow,
  SubscriptionStatusCounts,
  UpgradeTrendPoint,
  WebhookEventRow,
} from './types/admin-billing.type';

/** Platform-wide aggregates for the admin Billing page; every other reader of these tables is tenant-scoped. */
@Injectable()
export class AdminBillingRepository {
  constructor(private readonly dbService: DBService) {}

  /** Cheap LIMIT 1 existence check instead of getPlanSplit(), since the admin frontend calls it on every /admin/* page load. */
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

  /** Rows with NULL `status` (Free tenants that never started checkout) are excluded rather than bucketed. */
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
          eq(schema.stripeWebhookEvents.type, StripeWebhookEventType.CHECKOUT_SESSION_COMPLETED),
          gte(schema.stripeWebhookEvents.processedAt, windowStart)
        )
      )
      .groupBy(yearExpr, monthExpr);

    return rows.map(row => ({ year: row.year, month: row.month, count: row.value }));
  }

  async getUnresolvedPostErasureCharges(limit: number): Promise<PostErasureChargeRow[]> {
    return this.dbService.db
      .select({
        receiptId: schema.billingReceipts.id,
        tenantId: schema.billingReceipts.tenantId,
        businessName: schema.tenants.name,
        invoiceNumber: schema.billingReceipts.invoiceNumber,
        amountPaid: schema.billingReceipts.amountPaid,
        currency: schema.billingReceipts.currency,
        paidAt: schema.billingReceipts.paidAt,
      })
      .from(schema.billingReceipts)
      .innerJoin(schema.tenants, eq(schema.billingReceipts.tenantId, schema.tenants.id))
      .where(
        and(
          eq(schema.billingReceipts.paidAfterErasureRequest, true),
          isNull(schema.billingReceipts.refundResolvedAt)
        )
      )
      .orderBy(desc(schema.billingReceipts.paidAt))
      .limit(limit);
  }

  /** The WHERE carries the whole rule (flagged and unresolved), so repeats, unknown ids and never-flagged receipts return false and the first resolver's stamp is kept. */
  async resolvePostErasureCharge(input: { receiptId: string; adminId: string }): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.billingReceipts)
      .set({ refundResolvedAt: sql`now()`, refundResolvedByAdminId: input.adminId })
      .where(
        and(
          eq(schema.billingReceipts.id, input.receiptId),
          eq(schema.billingReceipts.paidAfterErasureRequest, true),
          isNull(schema.billingReceipts.refundResolvedAt)
        )
      )
      .returning({ id: schema.billingReceipts.id });

    return rows.length > 0;
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

  /**
   * Left joins keep orphan events (no matching subscription) and ones predating `stripe_customer_id`, with null
   * tenantId/businessName. Scoped to HANDLED_STRIPE_EVENT_TYPES via IN rather than a stored column, so a new
   * handler branch needs no backfill.
   */
  async listWebhookEvents(input: {
    page: number;
    pageSize: number;
    type?: string | undefined;
  }): Promise<{ events: WebhookEventRow[]; total: number }> {
    const conditions = [inArray(schema.stripeWebhookEvents.type, [...HANDLED_STRIPE_EVENT_TYPES])];
    if (input.type) {
      conditions.push(eq(schema.stripeWebhookEvents.type, input.type));
    }
    const where = and(...conditions);

    const [rows, totals] = await Promise.all([
      this.dbService.db
        .select({
          id: schema.stripeWebhookEvents.id,
          type: schema.stripeWebhookEvents.type,
          processedAt: schema.stripeWebhookEvents.processedAt,
          tenantId: schema.tenants.id,
          businessName: schema.tenants.name,
        })
        .from(schema.stripeWebhookEvents)
        .leftJoin(
          schema.tenantSubscriptions,
          eq(
            schema.stripeWebhookEvents.stripeCustomerId,
            schema.tenantSubscriptions.stripeCustomerId
          )
        )
        .leftJoin(schema.tenants, eq(schema.tenantSubscriptions.tenantId, schema.tenants.id))
        .where(where)
        .orderBy(desc(schema.stripeWebhookEvents.processedAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.dbService.db.select({ value: count() }).from(schema.stripeWebhookEvents).where(where),
    ]);

    const events = rows.map(row => ({
      ...row,
      tenantId: row.tenantId ?? null,
      businessName: row.businessName ?? null,
    }));

    return { events, total: totals[0]?.value ?? 0 };
  }
}
