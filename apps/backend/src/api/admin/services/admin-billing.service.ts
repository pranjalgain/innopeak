import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { AdminBillingDbService } from '@db/repositories/admin-billing/admin-billing.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth-user.type';
import { AdminBillingSummaryResponseDto } from '../dto/admin-billing-summary-response.dto';
import { HasPaidTenantsResponseDto } from '../dto/has-paid-tenants-response.dto';

@Injectable()
export class AdminBillingService {
  constructor(private readonly adminBillingDbService: AdminBillingDbService) {}

  /**
   * Backs the admin frontend's Billing nav item / dashboard-route guard, which otherwise hides
   * entirely whenever `PAYMENT_FEATURE_ENABLED` is off — that flag only ever gates *starting a
   * new checkout*, never a platform admin's ability to see billing they're still actively
   * responsible for. A tenant already on Paid keeps being charged by Stripe regardless of the
   * flag (see `BillingService.createCheckoutSession`'s own doc comment), so an admin needs to
   * keep being able to see that, look up who it is, and act on it, for as long as any such
   * tenant exists — independent of whether new signups are currently allowed.
   */
  async hasPaidTenants(actor: AuthUser): Promise<HasPaidTenantsResponseDto> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const hasPaidTenants = await this.adminBillingDbService.hasPaidTenants();
    return HasPaidTenantsResponseDto.from(hasPaidTenants);
  }

  async getSummary(actor: AuthUser, months: number): Promise<AdminBillingSummaryResponseDto> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const summary = await this.adminBillingDbService.getSummary(months);
    return AdminBillingSummaryResponseDto.from(summary);
  }
}
