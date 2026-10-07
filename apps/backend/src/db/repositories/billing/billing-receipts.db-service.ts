import { DrizzleTransaction } from '@db/db.service';
import { Injectable } from '@nestjs/common';

import { BillingReceiptsRepository } from './billing-receipts.repository';
import type {
  BillingReceiptRow,
  InsertBillingReceiptInput,
  RecordReceiptOutcome,
} from './types/billing.type';

@Injectable()
export class BillingReceiptsDbService {
  constructor(private readonly billingReceiptsRepository: BillingReceiptsRepository) {}

  recordIfNew(
    input: InsertBillingReceiptInput,
    tx?: DrizzleTransaction
  ): Promise<RecordReceiptOutcome> {
    return this.billingReceiptsRepository.insertIfNew(input, tx);
  }

  listByTenantId(tenantId: string): Promise<BillingReceiptRow[]> {
    return this.billingReceiptsRepository.findByTenantId(tenantId);
  }

  /** Tenant-scoped at the query itself — see `BillingReceiptsRepository.findByIdForTenant`. */
  findByIdForTenant(id: string, tenantId: string): Promise<BillingReceiptRow | null> {
    return this.billingReceiptsRepository.findByIdForTenant(id, tenantId);
  }
}
