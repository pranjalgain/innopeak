// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface PlatformActivityResponseDto {
  id: string;
  type: PlatformActivityResponseDtoTypeEnum;
  actorEmail: string;
  /**
   * Set for business_suspended/business_reactivated entries only.
   */
  businessName?: string | null;
  /**
   * Set for admin_invite_sent/admin_invite_revoked entries only.
   */
  email?: string | null;
  occurredAt: string;
}

export const PlatformActivityResponseDtoTypeEnum = {
  BusinessSuspended: 'business_suspended',
  BusinessReactivated: 'business_reactivated',
  AdminInviteSent: 'admin_invite_sent',
  AdminInviteRevoked: 'admin_invite_revoked',
  UserActivated: 'user_activated',
  UserDeactivated: 'user_deactivated',
  AdminDisabled: 'admin_disabled',
  AdminEnabled: 'admin_enabled',
} as const;

export type PlatformActivityResponseDtoTypeEnum =
  (typeof PlatformActivityResponseDtoTypeEnum)[keyof typeof PlatformActivityResponseDtoTypeEnum];
