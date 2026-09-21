import type { NotificationChannelPref } from '@common/enums/notification-channel-pref.enum';

export interface NotificationRecipientRecord {
  id: string;
  userId: string;
  name: string;
  channel: NotificationChannelPref;
  isActive: boolean;
}

export interface UpdateNotificationRecipientInput {
  id: string;
  tenantId: string;
  channel?: NotificationChannelPref;
  isActive?: boolean;
}
