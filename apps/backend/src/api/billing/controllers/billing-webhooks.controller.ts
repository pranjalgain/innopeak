import { Public } from '@auth/decorators/public.decorator';
import type { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, HttpCode, HttpStatus, Post, type RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { StripeWebhookSignatureInvalidException } from '../exceptions/billing.exceptions';
import { PaymentProvider } from '../providers/payment.provider';
import { BillingWebhooksService } from '../services/billing-webhooks.service';
import { ApiStripeWebhook } from '../swagger/billing-webhooks.swagger';

/**
 * `POST /v1/billing/webhooks/stripe` — `@Public()` (no JWT; Stripe's own `Stripe-Signature` header
 * is the trust boundary instead, exactly like this codebase already treats OTP/token verification
 * as the trust boundary on other `@Public()` auth routes). Reads `req.rawBody`, populated by the
 * route-scoped `bodyParser.raw()` registered ahead of the global JSON parser in `bootstrap.ts` —
 * a real signature check is only meaningful against the exact bytes Stripe signed, never a
 * re-serialized parsed body.
 */
@Controller({ path: RouteNames.BILLING, version: '1' })
@ApiTags('Billing')
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
