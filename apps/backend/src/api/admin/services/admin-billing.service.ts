import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { AdminBillingDbService } from '@db/repositories/admin-billing/admin-billing.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth.type';
import { WEBHOOK_EVENTS_PAGE_SIZE_DEFAULT } from '../constants/admin-billing.constants';
import { AdminBillingSummaryResponseDto } from '../dto/admin-billing-summary-response.dto';
import {
  BillingWebhookEventListResponseDto,
  BillingWebhookEventResponseDto,
} from '../dto/billing-webhook-event-response.dto';
import { HasPaidTenantsResponseDto } from '../dto/has-paid-tenants-response.dto';
import type { ListBillingWebhookEventsQueryDto } from '../dto/list-billing-webhook-events-query.dto';

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

  async listWebhookEvents(
    actor: AuthUser,
    query: ListBillingWebhookEventsQueryDto
  ): Promise<BillingWebhookEventListResponseDto> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? WEBHOOK_EVENTS_PAGE_SIZE_DEFAULT;

    const { events, total } = await this.adminBillingDbService.listWebhookEvents({
      page,
      pageSize,
      type: query.type,
    });

    return {
      events: events.map(row => BillingWebhookEventResponseDto.from(row)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }
}
