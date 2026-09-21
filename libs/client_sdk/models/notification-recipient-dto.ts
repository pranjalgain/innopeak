// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface NotificationRecipientDto {
  id: string;
  userId: string;
  name: string;
  initials: string;
  channel: NotificationRecipientDtoChannelEnum;
  isActive: boolean;
}

export const NotificationRecipientDtoChannelEnum = {
  Email: 'email',
  Teams: 'teams',
  Both: 'both',
} as const;

export type NotificationRecipientDtoChannelEnum =
  (typeof NotificationRecipientDtoChannelEnum)[keyof typeof NotificationRecipientDtoChannelEnum];
