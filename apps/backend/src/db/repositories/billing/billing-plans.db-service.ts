import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { DrizzleTransaction } from '@db/db.service';
import { Injectable } from '@nestjs/common';

import { BillingPlanRow, BillingPlansRepository } from './billing-plans.repository';

@Injectable()
export class BillingPlansDbService {
  constructor(private readonly billingPlansRepository: BillingPlansRepository) {}

  findByCode(code: BillingPlanCode, tx?: DrizzleTransaction): Promise<BillingPlanRow | null> {
    return this.billingPlansRepository.findByCode(code, tx);
  }

  findById(id: string): Promise<BillingPlanRow | null> {
    return this.billingPlansRepository.findById(id);
  }

  listAll(): Promise<BillingPlanRow[]> {
    return this.billingPlansRepository.listAll();
  }
}
