import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import { toIsoString } from '@common/helpers/date.utils';
import type { AdminBillingSummary } from '@db/repositories/admin-billing/admin-billing.db-service';
import type {
  AtRiskSubscriptionRow,
  UpgradeTrendPoint,
  WebhookEventRow,
} from '@db/repositories/admin-billing/admin-billing.repository';
import { ApiProperty } from '@nestjs/swagger';

/** Nested value objects for `AdminBillingSummaryResponseDto` — co-located rather than one file
 *  each, since none of the three is meaningful or reused outside this one parent response. */
export class UpgradeTrendPointResponseDto {
  @ApiProperty({ example: '2026-09', description: 'Calendar month, `YYYY-MM`, zero-padded.' })
  monthKey!: string;

  @ApiProperty({
    example: 7,
    description:
      'Free-to-Paid checkouts completed that month, counted from stripe_webhook_events rows of ' +
      'type checkout.session.completed.',
  })
  count!: number;

  static from(point: UpgradeTrendPoint): UpgradeTrendPointResponseDto {
    const dto = new UpgradeTrendPointResponseDto();
    dto.monthKey = `${point.year}-${String(point.month).padStart(2, '0')}`;
    dto.count = point.count;
    return dto;
  }
}

export class AtRiskSubscriptionResponseDto {
  @ApiProperty({ example: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  tenantId!: string;

  @ApiProperty({ example: 'The Coastal Table' })
  businessName!: string;

  @ApiProperty({ example: SubscriptionStatus.PAST_DUE, enum: SubscriptionStatus })
  status!: SubscriptionStatus;

  @ApiProperty({
    example: '2026-09-01T00:00:00.000Z',
    nullable: true,
    type: String,
    description: 'When the paid period Stripe last tried to renew was due to end.',
  })
  currentPeriodEnd!: string | null;

  static from(row: AtRiskSubscriptionRow): AtRiskSubscriptionResponseDto {
    const dto = new AtRiskSubscriptionResponseDto();
    dto.tenantId = row.tenantId;
    dto.businessName = row.businessName;
    dto.status = row.status;
    dto.currentPeriodEnd = row.currentPeriodEnd ? toIsoString(row.currentPeriodEnd) : null;
    return dto;
  }
}

export class BillingWebhookEventResponseDto {
  @ApiProperty({ example: 'evt_1UJ8pAPZYAmQ4L9BbRlyLvwZ', description: "Stripe's own event id." })
  id!: string;

  @ApiProperty({ example: 'checkout.session.completed' })
  type!: string;

  @ApiProperty({ example: '2026-09-24T09:27:54.169Z' })
  processedAt!: string;

  static from(row: WebhookEventRow): BillingWebhookEventResponseDto {
    const dto = new BillingWebhookEventResponseDto();
    dto.id = row.id;
    dto.type = row.type;
    dto.processedAt = toIsoString(row.processedAt);
    return dto;
  }
}

export class AdminBillingSummaryResponseDto {
  @ApiProperty({ example: 121, description: 'Tenants on the Free plan.' })
  freeCount!: number;

  @ApiProperty({ example: 7, description: 'Tenants on the Paid plan.' })
  paidCount!: number;

  @ApiProperty({ example: 6, description: 'Paid tenants with an active Stripe subscription.' })
  activeCount!: number;

  @ApiProperty({
    example: 1,
    description: "Paid tenants whose latest Stripe invoice failed — Stripe's own retry is ongoing.",
  })
  pastDueCount!: number;

  @ApiProperty({ example: 0, description: 'Subscriptions Stripe has fully ended.' })
  canceledCount!: number;

  @ApiProperty({
    example: 0,
    description: 'Subscriptions still finishing initial payment setup (e.g. 3DS pending).',
  })
  incompleteCount!: number;

  @ApiProperty({
    example: 2,
    description:
      'Subscriptions with cancel_at_period_end=true — still Paid and billed, but will drop to ' +
      'Free once the current period ends.',
  })
  cancelingCount!: number;

  @ApiProperty({
    type: [UpgradeTrendPointResponseDto],
    description: 'Oldest month first, covering the trailing `months` window (see the query param).',
  })
  upgradeTrend!: UpgradeTrendPointResponseDto[];

  @ApiProperty({
    type: [AtRiskSubscriptionResponseDto],
    description: 'Past-due subscriptions, most recently updated first, capped at 10.',
  })
  atRisk!: AtRiskSubscriptionResponseDto[];

  @ApiProperty({
    type: [BillingWebhookEventResponseDto],
    description: 'Most recently processed Stripe webhook deliveries, newest first, capped at 10.',
  })
  recentWebhookEvents!: BillingWebhookEventResponseDto[];

  static from(summary: AdminBillingSummary): AdminBillingSummaryResponseDto {
    const dto = new AdminBillingSummaryResponseDto();
    dto.freeCount = summary.freeCount;
    dto.paidCount = summary.paidCount;
    dto.activeCount = summary.activeCount;
    dto.pastDueCount = summary.pastDueCount;
    dto.canceledCount = summary.canceledCount;
    dto.incompleteCount = summary.incompleteCount;
    dto.cancelingCount = summary.cancelingCount;
    dto.upgradeTrend = summary.upgradeTrend.map(point => UpgradeTrendPointResponseDto.from(point));
    dto.atRisk = summary.atRisk.map(row => AtRiskSubscriptionResponseDto.from(row));
    dto.recentWebhookEvents = summary.recentWebhookEvents.map(row =>
      BillingWebhookEventResponseDto.from(row)
    );
    return dto;
  }
}
