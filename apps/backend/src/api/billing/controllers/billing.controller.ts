import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { UserRole } from '@auth/enums/user-role.enum';
import type { AuthUser } from '@auth/types/auth-user.type';
import { MESSAGES } from '@common/constants/messages.constants';
import type { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import type { BillingProfileResponseDto } from '../dto/billing-profile-response.dto';
import { CompleteDummyCheckoutDto } from '../dto/complete-dummy-checkout.dto';
import type { BillingPlansResponseDto } from '../dto/plan-response.dto';
import type { ReceiptListResponseDto } from '../dto/receipt-response.dto';
import type { RedirectUrlResponseDto } from '../dto/redirect-url-response.dto';
import { SetActiveLocationDto } from '../dto/set-active-location.dto';
import { SetDefaultPaymentMethodDto } from '../dto/set-default-payment-method.dto';
import type { SetupIntentResponseDto } from '../dto/setup-intent-response.dto';
import type { SubscriptionResponseDto } from '../dto/subscription-response.dto';
import { UpdateBillingProfileDto } from '../dto/update-billing-profile.dto';
import { BillingService } from '../services/billing.service';
import {
  ApiCancelSubscription,
  ApiCompleteDummyCheckout,
  ApiCreateCheckoutSession,
  ApiCreatePortalSession,
  ApiCreateSetupIntent,
  ApiDownloadReceiptPdf,
  ApiGetBillingProfile,
  ApiGetSubscription,
  ApiListBillingPlans,
  ApiListReceipts,
  ApiSetActiveLocation,
  ApiSetDefaultPaymentMethod,
  ApiUpdateBillingProfile,
} from '../swagger/billing.swagger';

/** Tenant-facing billing routes — owner-only, same reasoning as `PromptsController`: billing
 *  plans/upgrades are a business-level decision, not something any team member should trigger. */
@Controller({ path: RouteNames.BILLING, version: '1' })
@ApiTags('Billing')
@Roles(UserRole.OWNER)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get(RouteNames.BILLING_PLANS)
  @ApiListBillingPlans()
  async listPlans(@CurrentUser() user: AuthUser): Promise<ApiResponse<BillingPlansResponseDto>> {
    const result = await this.billingService.listPlans(user);
    return ResponseUtil.success(result, MESSAGES.BILLING.PLANS_RETRIEVED);
  }

  @Get(RouteNames.BILLING_SUBSCRIPTION)
  @ApiGetSubscription()
  async getSubscription(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<SubscriptionResponseDto>> {
    const result = await this.billingService.getSubscription(user);
    return ResponseUtil.success(result, MESSAGES.BILLING.SUBSCRIPTION_RETRIEVED);
  }

  @Post(RouteNames.BILLING_CHECKOUT)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateCheckoutSession()
  async createCheckoutSession(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<RedirectUrlResponseDto>> {
    const result = await this.billingService.createCheckoutSession(user);
    return ResponseUtil.success(
      result,
      MESSAGES.BILLING.CHECKOUT_SESSION_CREATED,
      HttpStatus.CREATED
    );
  }

  @Post(RouteNames.BILLING_PORTAL)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatePortalSession()
  async createPortalSession(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<RedirectUrlResponseDto>> {
    const result = await this.billingService.createPortalSession(user);
    return ResponseUtil.success(
      result,
      MESSAGES.BILLING.PORTAL_SESSION_CREATED,
      HttpStatus.CREATED
    );
  }

  @Put(RouteNames.BILLING_ACTIVE_LOCATION)
  @ApiSetActiveLocation()
  async setActiveLocation(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetActiveLocationDto
  ): Promise<ApiResponse<null>> {
    await this.billingService.setActiveLocation(user, dto.locationId);
    return ResponseUtil.success(null, MESSAGES.BILLING.ACTIVE_LOCATION_UPDATED);
  }

  @Post(RouteNames.BILLING_DUMMY_COMPLETE_CHECKOUT)
  @ApiCompleteDummyCheckout()
  async completeDummyCheckout(
    @CurrentUser() user: AuthUser,
    @Body() dto: CompleteDummyCheckoutDto
  ): Promise<ApiResponse<null>> {
    await this.billingService.completeDummyCheckout(user, dto.subscriptionId);
    return ResponseUtil.success(null, MESSAGES.BILLING.CHECKOUT_COMPLETED);
  }

  @Post(RouteNames.BILLING_CANCEL)
  @ApiCancelSubscription()
  async cancelSubscription(@CurrentUser() user: AuthUser): Promise<ApiResponse<null>> {
    await this.billingService.cancelSubscription(user);
    return ResponseUtil.success(null, MESSAGES.BILLING.SUBSCRIPTION_CANCELED);
  }

  @Get(RouteNames.BILLING_RECEIPTS)
  @ApiListReceipts()
  async listReceipts(@CurrentUser() user: AuthUser): Promise<ApiResponse<ReceiptListResponseDto>> {
    const result = await this.billingService.listReceipts(user);
    return ResponseUtil.success(result, MESSAGES.BILLING.RECEIPTS_RETRIEVED);
  }

  /** Binary PDF response — bypasses `ResponseUtil`/`ApiResponse<T>` entirely (see
   *  `TransformInterceptor`'s own doc comment for why this route's path is excluded from it),
   *  the same shape `MetricsController.getDefaultMetrics` uses for its own non-JSON body. */
  @Get(`${RouteNames.BILLING_RECEIPTS}/${RouteNames.BILLING_RECEIPT_PDF}`)
  @ApiDownloadReceiptPdf()
  async downloadReceiptPdf(
    @CurrentUser() user: AuthUser,
    // Same pipe `ReviewsController.getReview` uses on its own id param — without it a malformed
    // id reaches a `uuid` column comparison and Postgres raises 22P02, surfacing as a 500 rather
    // than the documented 404.
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
    @Res() res: Response
  ): Promise<void> {
    const { buffer, filename } = await this.billingService.downloadReceiptPdf(user, receiptId);
    res
      .status(HttpStatus.OK)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
      })
      .send(buffer);
  }

  @Get(RouteNames.BILLING_PROFILE)
  @ApiGetBillingProfile()
  async getBillingProfile(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<BillingProfileResponseDto>> {
    const result = await this.billingService.getBillingProfile(user);
    return ResponseUtil.success(result, MESSAGES.BILLING.BILLING_PROFILE_RETRIEVED);
  }

  @Put(RouteNames.BILLING_PROFILE)
  @ApiUpdateBillingProfile()
  async updateBillingProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateBillingProfileDto
  ): Promise<ApiResponse<BillingProfileResponseDto>> {
    const result = await this.billingService.updateBillingProfile(user, dto);
    return ResponseUtil.success(result, MESSAGES.BILLING.BILLING_PROFILE_UPDATED);
  }

  @Post(RouteNames.BILLING_SETUP_INTENT)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateSetupIntent()
  async createSetupIntent(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<SetupIntentResponseDto>> {
    const result = await this.billingService.createSetupIntent(user);
    return ResponseUtil.success(result, MESSAGES.BILLING.SETUP_INTENT_CREATED, HttpStatus.CREATED);
  }

  @Put(RouteNames.BILLING_PAYMENT_METHOD)
  @ApiSetDefaultPaymentMethod()
  async setDefaultPaymentMethod(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetDefaultPaymentMethodDto
  ): Promise<ApiResponse<null>> {
    await this.billingService.setDefaultPaymentMethod(user, dto.paymentMethodId);
    return ResponseUtil.success(null, MESSAGES.BILLING.PAYMENT_METHOD_UPDATED);
  }
}
