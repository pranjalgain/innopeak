import { StripeWebhookEventType } from '@billing/types/billing.type';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  WEBHOOK_EVENTS_PAGE_SIZE_DEFAULT,
  WEBHOOK_EVENTS_PAGE_SIZE_MAX,
} from '../constants/admin-billing.constants';
import { ADMIN_LIST_PAGE_MAX } from '../constants/admin-overview.constants';

const STRIPE_WEBHOOK_EVENT_TYPE_KEYS = Object.keys(StripeWebhookEventType);
const STRIPE_WEBHOOK_EVENT_TYPE_VALUES: string[] = Object.values(StripeWebhookEventType);

export class ListBillingWebhookEventsQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_PAGE_MAX)
  page?: number;

  @ApiPropertyOptional({
    example: WEBHOOK_EVENTS_PAGE_SIZE_DEFAULT,
    minimum: 1,
    maximum: WEBHOOK_EVENTS_PAGE_SIZE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WEBHOOK_EVENTS_PAGE_SIZE_MAX)
  pageSize?: number;

  @ApiPropertyOptional({
    example: 'CHECKOUT_SESSION_COMPLETED',
    enum: STRIPE_WEBHOOK_EVENT_TYPE_KEYS,
    description:
      "One of StripeWebhookEventType's own key names, not Stripe's raw dotted wire format — this " +
      "app's own filter vocabulary never leaks Stripe's internal naming into a URL. Mapped to the " +
      'matching raw type internally before it reaches the repository.',
  })
  @IsOptional()
  // Maps a key to its raw Stripe value before validation so downstream code keeps using raw types;
  // anything else passes through unchanged for `@IsIn` to judge.
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string' && value in StripeWebhookEventType) {
      return StripeWebhookEventType[value as keyof typeof StripeWebhookEventType];
    }
    return value;
  })
  @IsIn(STRIPE_WEBHOOK_EVENT_TYPE_VALUES, {
    message: `type must be one of: ${STRIPE_WEBHOOK_EVENT_TYPE_KEYS.join(', ')}`,
  })
  type?: string;
}
