import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/** `dummy_sub_<uuid>`, the shape DummyPaymentProvider mints; anchored to match the whole string. */
const DUMMY_SUBSCRIPTION_ID_PATTERN =
  /^dummy_sub_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Format check is defense-in-depth alongside the unique index on `tenant_subscriptions.stripe_subscription_id`, which this id becomes. */
export class CompleteDummyCheckoutDto {
  @ApiProperty({ example: 'dummy_sub_0190f4a1-7c33-7e51-9a02-6d1b8f4c0044' })
  @Matches(DUMMY_SUBSCRIPTION_ID_PATTERN, {
    message: 'subscriptionId must be a dummy_sub_<uuid> id',
  })
  subscriptionId!: string;
}
