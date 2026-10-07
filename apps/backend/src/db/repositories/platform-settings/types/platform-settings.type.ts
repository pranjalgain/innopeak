export interface PlatformSettingsRow {
  ssoLoginEnabled: boolean;
  passwordLoginEnabled: boolean;
  socialLoginEnabled: boolean;
  inviteMembersEnabled: boolean;
  /** The platform admin whose `update()` last changed the row; null on the seeded row. Set by `update()`, never by the patch. */
  updatedByPlatformAdminId: string | null;
}

/** What a caller may toggle; `updatedByPlatformAdminId` is derived from `actorPlatformAdminId`, not trusted from the patch. */
export type PlatformSettingsPatch = Partial<Omit<PlatformSettingsRow, 'updatedByPlatformAdminId'>>;
