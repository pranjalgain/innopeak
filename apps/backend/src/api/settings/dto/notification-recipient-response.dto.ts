import { NotificationChannelPref } from '@common/enums/notification-channel-pref.enum';
import { ApiProperty } from '@nestjs/swagger';

import type { NotificationRecipientRecord } from '../types/settings.type';
import { getInitials } from '../utils/initials.util';

export class NotificationRecipientDto {
  @ApiProperty({ example: '0190f3c1-0a12-7b40-9e63-11c4a7f0b2d8' })
  id!: string;

  @ApiProperty({ example: '0190f3c1-0a12-7b40-9e63-11c4a7f0b2d9' })
  userId!: string;

  @ApiProperty({ example: 'Maria Delgado' })
  name!: string;

  @ApiProperty({ example: 'MD' })
  initials!: string;

  @ApiProperty({ example: NotificationChannelPref.EMAIL, enum: NotificationChannelPref })
  channel!: NotificationChannelPref;

  @ApiProperty({ example: true })
  isActive!: boolean;

  /** `fallbackName` stands in for an anonymized user (`users.name` is NULL), in the caller's language: the frontend assumes a display name. */
  static from(row: NotificationRecipientRecord, fallbackName: string): NotificationRecipientDto {
    const dto = new NotificationRecipientDto();
    dto.id = row.id;
    dto.userId = row.userId;
    dto.name = row.name ?? fallbackName;
    dto.initials = getInitials(dto.name);
    dto.channel = row.channel;
    dto.isActive = row.isActive;
    return dto;
  }
}

export class NotificationRecipientListResponseDto {
  @ApiProperty({
    type: [NotificationRecipientDto],
    example: [
      {
        id: '0190f3d2-6e55-7c18-a20b-8d3f1e4c9a67',
        userId: '0190f3b2-4d90-7a55-b7e2-9f1c3a6d8e21',
        name: 'Maria Delgado',
        initials: 'MD',
        channel: 'both',
        isActive: true,
      },
    ],
  })
  items!: NotificationRecipientDto[];

  static from(
    rows: NotificationRecipientRecord[],
    fallbackName: string
  ): NotificationRecipientListResponseDto {
    const dto = new NotificationRecipientListResponseDto();
    dto.items = rows.map(row => NotificationRecipientDto.from(row, fallbackName));
    return dto;
  }
}
