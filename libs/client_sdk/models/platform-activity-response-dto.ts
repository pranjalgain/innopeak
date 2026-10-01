// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface PlatformActivityResponseDto {
  id: string;
  type: PlatformActivityResponseDtoTypeEnum;
  /**
   * Null for a synthesized business_joined entry — see its own comment.
   */
  actorEmail?: string | null;
  /**
   * Set for business_suspended/business_reactivated/business_joined entries only.
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
  BusinessErasureRequested: 'business_erasure_requested',
  BusinessErasureCancelled: 'business_erasure_cancelled',
  BusinessErased: 'business_erased',
  AdminInviteSent: 'admin_invite_sent',
  AdminInviteRevoked: 'admin_invite_revoked',
  UserActivated: 'user_activated',
  UserDeactivated: 'user_deactivated',
  AdminDisabled: 'admin_disabled',
  AdminEnabled: 'admin_enabled',
  BusinessJoined: 'business_joined',
} as const;

export type PlatformActivityResponseDtoTypeEnum =
  (typeof PlatformActivityResponseDtoTypeEnum)[keyof typeof PlatformActivityResponseDtoTypeEnum];
