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
  /**
   * This user\'s current avatar, from the `media` table — null until one is uploaded.
   */
  avatarUrl?: string | null;
  /**
   * The stored `users.locale` preference, or null when the user has never set one — in which case the API falls back to negotiating the caller\'s `Accept-Language` header per request rather than defaulting silently to English.
   */
  locale?: AuthenticatedUserDtoLocaleEnum | null;
}

export const AuthenticatedUserDtoRoleEnum = {
  Owner: 'owner',
  Member: 'member',
} as const;

export type AuthenticatedUserDtoRoleEnum =
  (typeof AuthenticatedUserDtoRoleEnum)[keyof typeof AuthenticatedUserDtoRoleEnum];
export const AuthenticatedUserDtoLocaleEnum = {
  En: 'en',
  De: 'de',
} as const;

export type AuthenticatedUserDtoLocaleEnum =
  (typeof AuthenticatedUserDtoLocaleEnum)[keyof typeof AuthenticatedUserDtoLocaleEnum];
