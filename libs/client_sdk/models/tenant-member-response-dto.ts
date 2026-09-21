// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface TenantMemberResponseDto {
  id: string;
  /**
   * Before the invite is accepted, this is the invited email address — the invitee\'s own name isn\'t known yet, since they choose it on the accept screen, not the owner on the invite form.
   */
  name: string;
  email: string;
  role: TenantMemberResponseDtoRoleEnum;
  status: TenantMemberResponseDtoStatusEnum;
  /**
   * The owner\'s own row (created at signup, never invited) uses its own `createdAt`.
   */
  invitedAt: string;
}

export const TenantMemberResponseDtoRoleEnum = {
  Owner: 'owner',
  Member: 'member',
} as const;

export type TenantMemberResponseDtoRoleEnum =
  (typeof TenantMemberResponseDtoRoleEnum)[keyof typeof TenantMemberResponseDtoRoleEnum];
export const TenantMemberResponseDtoStatusEnum = {
  Active: 'active',
  Disabled: 'disabled',
  Invited: 'invited',
  PendingVerification: 'pending_verification',
} as const;

export type TenantMemberResponseDtoStatusEnum =
  (typeof TenantMemberResponseDtoStatusEnum)[keyof typeof TenantMemberResponseDtoStatusEnum];
