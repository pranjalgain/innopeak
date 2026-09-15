// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface AdminUserResponseDto {
  id: string;
  businessId: string;
  businessName: string;
  name: string;
  email: string;
  role: AdminUserResponseDtoRoleEnum;
  /**
   * Derived from `users.status`: true only when it\'s exactly `active`.
   */
  isActive: boolean;
  /**
   * Most recent refresh-token issuance for this user — there is no dedicated `last_login_at` column. `null` means no session has ever been issued.
   */
  lastLoginAt?: string | null;
}

export const AdminUserResponseDtoRoleEnum = {
  Owner: 'owner',
  Member: 'member',
} as const;

export type AdminUserResponseDtoRoleEnum =
  (typeof AdminUserResponseDtoRoleEnum)[keyof typeof AdminUserResponseDtoRoleEnum];
