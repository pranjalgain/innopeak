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
import { PostErasureChargeNotFoundException } from '../exceptions/admin.exceptions';

@Injectable()
export class AdminBillingService {
  constructor(private readonly adminBillingDbService: AdminBillingDbService) {}

  /** Visible even with `PAYMENT_FEATURE_ENABLED` off: that flag only gates new checkouts, and tenants already on Paid keep being charged. */
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

  /** Does not touch Stripe (the admin already refunded there). Anything but an unresolved flagged receipt is 404. */
  async resolvePostErasureCharge(actor: AuthUser, receiptId: string): Promise<{ message: string }> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const resolved = await this.adminBillingDbService.resolvePostErasureCharge({
      receiptId,
      adminId: admin.id,
    });
    if (!resolved) {
      throw new PostErasureChargeNotFoundException();
    }
    return { message: MESSAGES.ADMIN.POST_ERASURE_CHARGE_RESOLVED };
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
