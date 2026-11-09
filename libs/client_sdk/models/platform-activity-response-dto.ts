// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { PlatformActivityDetailsDto } from './platform-activity-details-dto';

export interface PlatformActivityResponseDto {
  id: string;
  type: PlatformActivityResponseDtoTypeEnum;
  /**
   * Who did it: the platform admin; the business owner\'s email for business_joined; the label \"owner (self-service)\" for an owner\'s own erasure request or cancellation; or the system actor for the nightly erasure.
   */
  actorEmail: string;
  /**
   * Set for the business_* entries (including business_joined) and user_* entries.
   */
  businessName?: string | null;
  /**
   * Set for admin_invite_sent/admin_invite_revoked entries only.
   */
  email?: string | null;
  /**
   * What a platform_settings_changed entry changed; null for every other type.
   */
  details?: PlatformActivityDetailsDto | null;
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
  PlatformSettingsChanged: 'platform_settings_changed',
} as const;

export type PlatformActivityResponseDtoTypeEnum =
  (typeof PlatformActivityResponseDtoTypeEnum)[keyof typeof PlatformActivityResponseDtoTypeEnum];
