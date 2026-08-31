import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { WebhookDeliveryRecord, WebhookRecord } from '../interfaces/webhook.interface';

export class WebhookResponseDto {
  @ApiProperty({
    description: 'Webhook ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Owner user ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  userId!: string;

  @ApiProperty({
    description: 'Webhook target URL',
    example: 'https://example.com/webhooks/receive',
  })
  url!: string;

  @ApiProperty({
    description: 'Subscribed events',
    example: ['user.created', 'user.updated'],
    type: [String],
  })
  events!: string[];

  @ApiProperty({
    description: 'Whether the webhook is active',
    example: true,
  })
  isActive!: boolean;

  @ApiPropertyOptional({
    description: 'Webhook description',
    example: 'Notify external CRM on user events',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({ description: 'When the webhook was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the webhook was last updated' })
  updatedAt!: Date;

  static fromRecord(record: WebhookRecord): WebhookResponseDto {
    const dto = new WebhookResponseDto();
    dto.id = record.id;
    dto.userId = record.userId;
    dto.url = record.url;
    dto.events = record.events;
    dto.isActive = record.isActive;
    dto.description = record.description;
    dto.createdAt = record.createdAt;
    dto.updatedAt = record.updatedAt;
    return dto;
  }
}

export class WebhookDeliveryResponseDto {
  @ApiProperty({
    description: 'Delivery ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Associated webhook ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  webhookId!: string;

  @ApiProperty({
    description: 'Event name',
    example: 'user.created',
  })
  event!: string;

  @ApiProperty({ description: 'Event payload' })
  payload!: unknown;

  @ApiPropertyOptional({
    description: 'HTTP response status from the target',
    example: 200,
    nullable: true,
  })
  responseStatus!: number | null;

  @ApiPropertyOptional({
    description: 'HTTP response body from the target',
    nullable: true,
  })
  responseBody!: string | null;

  @ApiProperty({
    description: 'Delivery attempt number',
    example: 1,
  })
  attempt!: number;

  @ApiPropertyOptional({
    description: 'When the delivery was successfully completed',
    nullable: true,
  })
  deliveredAt!: Date | null;

  @ApiPropertyOptional({
    description: 'When the next retry is scheduled',
    nullable: true,
  })
  nextRetryAt!: Date | null;

  @ApiProperty({
    description: 'Delivery status',
    example: 'delivered',
    enum: ['pending', 'delivered', 'failed'],
  })
  status!: string;

  @ApiProperty({ description: 'When the delivery was created' })
  createdAt!: Date;

  static fromRecord(record: WebhookDeliveryRecord): WebhookDeliveryResponseDto {
    const dto = new WebhookDeliveryResponseDto();
    dto.id = record.id;
    dto.webhookId = record.webhookId;
    dto.event = record.event;
    dto.payload = record.payload;
    dto.responseStatus = record.responseStatus;
    dto.responseBody = record.responseBody;
    dto.attempt = record.attempt;
    dto.deliveredAt = record.deliveredAt;
    dto.nextRetryAt = record.nextRetryAt;
    dto.status = record.status;
    dto.createdAt = record.createdAt;
    return dto;
  }
}
