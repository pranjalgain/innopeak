import { Public } from '@auth/decorators/public.decorator';
import { SKIP_ALL_THROTTLERS } from '@common/constants/throttle.constants';
import type { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, HttpCode, HttpStatus, Post, type RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { StripeWebhookSignatureInvalidException } from '../exceptions/billing.exceptions';
import { PaymentProvider } from '../providers/payment.provider';
import { BillingWebhooksService } from '../services/billing-webhooks.service';
import { ApiStripeWebhook } from '../swagger/billing-webhooks.swagger';

/**
 * No JWT: the `Stripe-Signature` header is the trust boundary, checked against `req.rawBody` (route-scoped
 * `bodyParser.raw()` in `bootstrap.ts`), since a signature only matches the exact bytes Stripe signed.
 * `SKIP_ALL_THROTTLERS`: a bare `@SkipThrottle()` only skips a tier named `default`, which this app has
 * none of; and a 429 counts as a failed delivery, burning Stripe's finite retries.
 */
@Controller({ path: RouteNames.BILLING, version: '1' })
@ApiTags('Billing')
@SkipThrottle(SKIP_ALL_THROTTLERS)
export class BillingWebhooksController {
  constructor(
    private readonly paymentProvider: PaymentProvider,
    private readonly billingWebhooksService: BillingWebhooksService
  ) {}

  @Public()
  @Post(RouteNames.BILLING_WEBHOOKS_STRIPE)
  @HttpCode(HttpStatus.OK)
  @ApiStripeWebhook()
  async handleStripeWebhook(@Req() req: RawBodyRequest<Request>): Promise<ApiResponse<null>> {
    const signature = req.headers['stripe-signature'];
    if (!req.rawBody || typeof signature !== 'string') {
      throw new StripeWebhookSignatureInvalidException();
    }

    const event = this.paymentProvider.constructWebhookEvent(req.rawBody, signature);
    await this.billingWebhooksService.handleEvent(event);

    return ResponseUtil.success(null);
  }
}
