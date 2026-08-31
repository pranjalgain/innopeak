import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { NotificationRecord } from '../interfaces/notification.interface';

export class NotificationResponseDto {
  @ApiProperty({
    description: 'Notification ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Recipient user ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  userId!: string;

  @ApiProperty({ description: 'Notification title', example: 'New message received' })
  title!: string;

  @ApiProperty({
    description: 'Notification body text',
    example: 'You have a new message from John.',
  })
  body!: string;

  @ApiProperty({ description: 'Notification type', example: 'message' })
  type!: string;

  @ApiProperty({ description: 'Additional notification data' })
  data!: unknown;

  @ApiProperty({
    description: 'Delivery channel',
    enum: ['push', 'email', 'sms', 'in-app'],
    example: 'push',
  })
  channel!: string;

  @ApiProperty({ description: 'Whether the notification has been read', example: false })
  isRead!: boolean;

  @ApiPropertyOptional({ description: 'When the notification was sent', nullable: true })
  sentAt!: Date | null;

  @ApiPropertyOptional({
    description: 'When the notification was read',
    nullable: true,
  })
  readAt!: Date | null;

  @ApiProperty({ description: 'When the notification was created' })
  createdAt!: Date;

  static fromRecord(record: NotificationRecord): NotificationResponseDto {
    const dto = new NotificationResponseDto();
    dto.id = record.id;
    dto.userId = record.userId;
    dto.title = record.title;
    dto.body = record.body;
    dto.type = record.type;
    dto.data = record.data;
    dto.channel = record.channel;
    dto.isRead = record.isRead;
    dto.sentAt = record.sentAt;
    dto.readAt = record.readAt;
    dto.createdAt = record.createdAt;
    return dto;
  }
}
