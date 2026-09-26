import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/** `dummy_sub_<uuid>` — exactly the shape `DummyPaymentProvider.createCheckoutSession` mints
 *  (`randomUUID()`, Node's own UUIDv4 output). Anchored so it matches the whole string, not just a
 *  prefix. */
const DUMMY_SUBSCRIPTION_ID_PATTERN =
  /^dummy_sub_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Body for `POST /v1/billing/dummy/complete-checkout` — the `subscriptionId`
 *  `DummyPaymentProvider.createCheckoutSession` minted and put in the confirmation page's own URL,
 *  echoed back so the fabricated `checkout.session.completed` event carries the same id the
 *  frontend already saw. Constrained to that exact shape rather than any non-empty string: this
 *  route is Dummy-only (see `DummyProviderNotActiveException`) and its `subscriptionId` becomes
 *  `tenant_subscriptions.stripe_subscription_id` for the caller's own tenant — the format check is
 *  defense-in-depth alongside that column's own unique index, not the only thing standing between
 *  a malformed value and the row. */
export class CompleteDummyCheckoutDto {
  @ApiProperty({ example: 'dummy_sub_0190f4a1-7c33-7e51-9a02-6d1b8f4c0044' })
  @Matches(DUMMY_SUBSCRIPTION_ID_PATTERN, {
    message: 'subscriptionId must be a dummy_sub_<uuid> id',
  })
  subscriptionId!: string;
}
