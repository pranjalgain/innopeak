import { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  NotificationReadResult,
  NotificationRecord,
  NotificationsPage,
} from '../types/notification.type';

export class NotificationDto {
  @ApiProperty({ example: '0190f3b2-8c41-7a2e-9f5d-11c0de44aa01' })
  id!: string;

  @ApiProperty({ example: InAppNotificationType.REVIEW_ESCALATED, enum: InAppNotificationType })
  type!: InAppNotificationType;

  @ApiProperty({ example: 'Review escalated' })
  title!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'A 1-star review from Jordan P. was flagged for low rating and needs your attention.',
    nullable: true,
  })
  description!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '0190f3aa-1f02-7bb1-8e30-91ab77cc2201',
    nullable: true,
    description: 'Present when this notification links to a specific review.',
  })
  reviewId!: string | null;

  @ApiProperty({ example: false })
  isRead!: boolean;

  @ApiProperty({ example: '2026-09-19T09:15:00.000Z' })
  createdAt!: string;

  static from(row: NotificationRecord): NotificationDto {
    const dto = new NotificationDto();
    dto.id = row.id;
    dto.type = row.type;
    dto.title = row.title;
    dto.description = row.description;
    dto.reviewId = row.reviewId;
    dto.isRead = row.isRead;
    dto.createdAt = row.createdAt;
    return dto;
  }
}

/** Flat — no `meta` wrapper — matching the web app's own `NotificationPage`
 *  (`notification.service.ts`), not this app's usual `{ data, meta }` list shape. See the
 *  overview's MVP scope for why this route is a deliberate exception. */
export class NotificationListResponseDto {
  @ApiProperty({
    type: [NotificationDto],
    example: [
      {
        id: '0190f3b2-8c41-7a2e-9f5d-11c0de44aa01',
        type: 'review_escalated',
        title: 'Review escalated',
        description:
          'A 1-star review from Jordan P. was flagged for low rating and needs your attention.',
        reviewId: '0190f3aa-1f02-7bb1-8e30-91ab77cc2201',
        isRead: false,
        createdAt: '2026-09-19T09:15:00.000Z',
      },
    ],
  })
  items!: NotificationDto[];

  @ApiProperty({
    example: true,
    description: 'Whether a further call with offset + limit would return more rows.',
  })
  hasMore!: boolean;

  @ApiProperty({
    example: 5,
    description: 'Unread count across the whole feed, not just this page.',
  })
  unreadTotal!: number;

  static from(page: NotificationsPage): NotificationListResponseDto {
    const dto = new NotificationListResponseDto();
    dto.items = page.items.map(row => NotificationDto.from(row));
    dto.hasMore = page.hasMore;
    dto.unreadTotal = page.unreadTotal;
    return dto;
  }
}

/** What both mark-read routes answer with. Only the unread count, because that is the single
 *  thing the caller cannot derive for itself: the row it just marked is one it already holds. */
export class NotificationReadResponseDto {
  @ApiProperty({
    example: 4,
    description: 'Unread count across the whole feed after this write.',
  })
  unreadTotal!: number;

  static from(result: NotificationReadResult): NotificationReadResponseDto {
    const dto = new NotificationReadResponseDto();
    dto.unreadTotal = result.unreadTotal;
    return dto;
  }
}
