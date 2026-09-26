import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import type { AuthUser } from '@auth/types/auth-user.type';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AdminBillingSummaryQueryDto } from '../dto/admin-billing-summary-query.dto';
import { AdminBillingSummaryResponseDto } from '../dto/admin-billing-summary-response.dto';
import { HasPaidTenantsResponseDto } from '../dto/has-paid-tenants-response.dto';
import { AdminBillingService } from '../services/admin-billing.service';
import { ApiGetBillingSummary, ApiGetHasPaidTenants } from '../swagger/admin-billing.swagger';

/** Platform-admin visibility into `billing_plans`/`tenant_subscriptions`/`stripe_webhook_events` —
 *  see `ApiGetBillingSummary`'s own doc comment for what this covers. Deliberately separate from
 *  the tenant-facing `BillingController`/`BillingWebhooksController` (`src/api/billing/`): this
 *  reads across every tenant rather than acting on the caller's own one. */
@Controller({ path: RouteNames.ADMIN_BILLING, version: '1' })
@ApiTags('Admin — Billing')
@Roles(JwtTokenType.PLATFORM_ADMIN)
export class AdminBillingController {
  constructor(private readonly adminBillingService: AdminBillingService) {}

  @Get(RouteNames.ADMIN_BILLING_HAS_PAID_TENANTS)
  @ApiGetHasPaidTenants()
  async hasPaidTenants(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponseDto<HasPaidTenantsResponseDto>> {
    const result = await this.adminBillingService.hasPaidTenants(user);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.ADMIN_BILLING_SUMMARY)
  @ApiGetBillingSummary()
  async getSummary(
    @CurrentUser() user: AuthUser,
    @Query() query: AdminBillingSummaryQueryDto
  ): Promise<ApiResponseDto<AdminBillingSummaryResponseDto>> {
    const result = await this.adminBillingService.getSummary(user, query.months);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }
}
