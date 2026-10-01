import { PaginationMetaDto } from '@common/dto/pagination-meta.dto';
import { toIsoString } from '@common/helpers/date.utils';
import type { WebhookEventRow } from '@db/repositories/admin-billing/types/admin-billing.type';
import { ApiProperty } from '@nestjs/swagger';

export class BillingWebhookEventResponseDto {
  @ApiProperty({ example: 'evt_1UJ8pAPZYAmQ4L9BbRlyLvwZ', description: "Stripe's own event id." })
  id!: string;

  @ApiProperty({ example: 'checkout.session.completed' })
  type!: string;

  @ApiProperty({ example: '2026-09-24T09:27:54.169Z' })
  processedAt!: string;

  @ApiProperty({
    example: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
    nullable: true,
    type: String,
    description:
      'Null when this event is an orphan delivery — its Stripe customer id matches no tenant.',
  })
  tenantId!: string | null;

  @ApiProperty({ example: 'The Coastal Table', nullable: true, type: String })
  businessName!: string | null;

  static from(row: WebhookEventRow): BillingWebhookEventResponseDto {
    const dto = new BillingWebhookEventResponseDto();
    dto.id = row.id;
    dto.type = row.type;
    dto.processedAt = toIsoString(row.processedAt);
    dto.tenantId = row.tenantId;
    dto.businessName = row.businessName;
    return dto;
  }
}

export class BillingWebhookEventListResponseDto {
  @ApiProperty({
    type: [BillingWebhookEventResponseDto],
    description: 'Newest first.',
  })
  events!: BillingWebhookEventResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
