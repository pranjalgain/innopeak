import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { BillingPlanRow } from './types/billing.type';

const PLAN_COLUMNS = {
  id: schema.billingPlans.id,
  code: schema.billingPlans.code,
  stripeProductId: schema.billingPlans.stripeProductId,
  stripePriceId: schema.billingPlans.stripePriceId,
  maxLocations: schema.billingPlans.maxLocations,
  maxAiDraftsPerMonth: schema.billingPlans.maxAiDraftsPerMonth,
  maxTeamMembers: schema.billingPlans.maxTeamMembers,
  customPromptsEnabled: schema.billingPlans.customPromptsEnabled,
} as const;

/** Seeded static catalog (free/paid); read-only on purpose since it is not admin-managed. */
@Injectable()
export class BillingPlansRepository {
  constructor(private readonly dbService: DBService) {}

  /** `tx` lets a caller already in a transaction (e.g. signup) read without borrowing a second pooled connection. */
  async findByCode(code: BillingPlanCode, tx?: DrizzleTransaction): Promise<BillingPlanRow | null> {
    const rows = await (tx ?? this.dbService.db)
      .select(PLAN_COLUMNS)
      .from(schema.billingPlans)
      .where(eq(schema.billingPlans.code, code))
      .limit(1);

    return (rows[0] as BillingPlanRow | undefined) ?? null;
  }

  async findById(id: string): Promise<BillingPlanRow | null> {
    const rows = await this.dbService.db
      .select(PLAN_COLUMNS)
      .from(schema.billingPlans)
      .where(eq(schema.billingPlans.id, id))
      .limit(1);

    return (rows[0] as BillingPlanRow | undefined) ?? null;
  }

  async listAll(): Promise<BillingPlanRow[]> {
    return this.dbService.db.select(PLAN_COLUMNS).from(schema.billingPlans) as Promise<
      BillingPlanRow[]
    >;
  }
}
