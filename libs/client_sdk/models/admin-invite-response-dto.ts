// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface AdminInviteResponseDto {
  id: string;
  email: string;
  status: AdminInviteResponseDtoStatusEnum;
  invitedAt: string;
  /**
   * When the pending invite lapses. `null` for an admin that was never invited — the seeded root admin — since there is no invite to expire.
   */
  expiresAt?: string | null;
  /**
   * Whether this is the seeded root admin. The one row with no invite to expire, disable, or revoke — the Members UI hides those actions for it.
   */
  isRoot: boolean;
}

export const AdminInviteResponseDtoStatusEnum = {
  Invited: 'invited',
  Active: 'active',
  Disabled: 'disabled',
} as const;

export type AdminInviteResponseDtoStatusEnum =
  (typeof AdminInviteResponseDtoStatusEnum)[keyof typeof AdminInviteResponseDtoStatusEnum];
