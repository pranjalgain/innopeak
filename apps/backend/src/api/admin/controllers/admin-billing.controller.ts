import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import type { AuthUser } from '@auth/types/auth.type';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AdminBillingSummaryQueryDto } from '../dto/admin-billing-summary-query.dto';
import { AdminBillingSummaryResponseDto } from '../dto/admin-billing-summary-response.dto';
import { BillingWebhookEventListResponseDto } from '../dto/billing-webhook-event-response.dto';
import { HasPaidTenantsResponseDto } from '../dto/has-paid-tenants-response.dto';
import { ListBillingWebhookEventsQueryDto } from '../dto/list-billing-webhook-events-query.dto';
import { AdminBillingService } from '../services/admin-billing.service';
import {
  ApiGetBillingSummary,
  ApiGetHasPaidTenants,
  ApiListBillingWebhookEvents,
  ApiResolvePostErasureCharge,
} from '../swagger/admin-billing.swagger';

/** Separate from the tenant-facing billing controllers: this reads across every tenant. */
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

  @Post(RouteNames.ADMIN_BILLING_RESOLVE_POST_ERASURE_CHARGE)
  @HttpCode(HttpStatus.OK)
  @ApiResolvePostErasureCharge()
  async resolvePostErasureCharge(
    @CurrentUser() user: AuthUser,
    @Param('receiptId', ParseUUIDPipe) receiptId: string
  ): Promise<ApiResponseDto<{ message: string }>> {
    const result = await this.adminBillingService.resolvePostErasureCharge(user, receiptId);
    return ResponseUtil.success(result, result.message, HttpStatus.OK);
  }

  @Get(RouteNames.ADMIN_BILLING_WEBHOOK_EVENTS)
  @ApiListBillingWebhookEvents()
  async listWebhookEvents(
    @CurrentUser() user: AuthUser,
    @Query() query: ListBillingWebhookEventsQueryDto
  ): Promise<ApiResponseDto<BillingWebhookEventListResponseDto>> {
    const result = await this.adminBillingService.listWebhookEvents(user, query);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }
}
