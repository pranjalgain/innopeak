// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface AdminProfileResponseDto {
  email: string;
  avatarUrl?: string | null;
  /**
   * The stored `platform_admins.locale` preference, or null when the admin has never set one — in which case the API falls back to negotiating the caller\'s `Accept-Language` header per request rather than defaulting silently to English.
   */
  locale?: AdminProfileResponseDtoLocaleEnum | null;
  /**
   * `false` for a Google-only admin (accepted an invite via SSO, or every admin before this flow existed) — Settings shows \"Add password\" instead of \"Change password\" for those.
   */
  hasPassword: boolean;
}

export const AdminProfileResponseDtoLocaleEnum = {
  En: 'en',
  De: 'de',
} as const;

export type AdminProfileResponseDtoLocaleEnum =
  (typeof AdminProfileResponseDtoLocaleEnum)[keyof typeof AdminProfileResponseDtoLocaleEnum];
