// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface AuthenticatedUserDto {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  /**
   * The tenant/company name set at signup (`tenants.name`) — read-only in Settings.
   */
  businessName: string;
  role: AuthenticatedUserDtoRoleEnum;
  /**
   * Whether `users.password_hash` is set. `false` for a Google-only account that has never set a password — Settings uses this to show \"Add password\" instead of \"Change password\".
   */
  hasPassword: boolean;
}

export const AuthenticatedUserDtoRoleEnum = {
  Owner: 'owner',
  Member: 'member',
} as const;

export type AuthenticatedUserDtoRoleEnum =
  (typeof AuthenticatedUserDtoRoleEnum)[keyof typeof AuthenticatedUserDtoRoleEnum];
