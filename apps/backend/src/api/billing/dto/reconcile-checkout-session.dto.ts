import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** Body for `POST /v1/billing/checkout/reconcile` — the real Stripe Checkout Session id the
 *  browser landed on `success_url` with (via the `{CHECKOUT_SESSION_ID}` template token Stripe
 *  substitutes on redirect). Not format-constrained to Stripe's own `cs_...` shape: unlike
 *  `CompleteDummyCheckoutDto`'s `dummy_sub_<uuid>` pattern (an id this app itself mints), a Checkout
 *  Session id is opaque and provider-defined — `BillingReconciliationService` treats a malformed or
 *  unknown one as whatever `PaymentProvider.retrieveCheckoutSession` reports, not something to
 *  pre-validate a shape for here. */
export class ReconcileCheckoutSessionDto {
  @ApiProperty({ example: 'cs_test_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6' })
  @IsString()
  @MinLength(1, { message: 'checkoutSessionId must not be empty' })
  checkoutSessionId!: string;
}
