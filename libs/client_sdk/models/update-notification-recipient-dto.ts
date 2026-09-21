// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface UpdateNotificationRecipientDto {
  /**
   * The recipient’s preference — accepted and stored regardless of whether anything dispatches over it yet. No escalation composer exists in this pass (see the notifications module’s own docs), so this is pure configuration for now, not a live setting with an immediate effect.
   */
  channel?: UpdateNotificationRecipientDtoChannelEnum;
  isActive?: boolean;
}

export const UpdateNotificationRecipientDtoChannelEnum = {
  Email: 'email',
  Teams: 'teams',
  Both: 'both',
} as const;

export type UpdateNotificationRecipientDtoChannelEnum =
  (typeof UpdateNotificationRecipientDtoChannelEnum)[keyof typeof UpdateNotificationRecipientDtoChannelEnum];
