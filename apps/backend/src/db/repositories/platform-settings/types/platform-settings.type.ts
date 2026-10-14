export interface PlatformSettingsRow {
  microsoftLoginEnabled: boolean;
  passwordLoginEnabled: boolean;
  googleLoginEnabled: boolean;
  inviteMembersEnabled: boolean;
  /** Whether tenants see notification channel preferences. Off in phase one (in-app notifications only). */
  notificationSettingsEnabled: boolean;
  /** The platform admin whose `update()` last changed the row; null on the seeded row. Set by `update()`, never by the patch. */
  updatedByPlatformAdminId: string | null;
}

/** What a caller may toggle; `updatedByPlatformAdminId` is derived from `actorPlatformAdminId`, not trusted from the patch. */
export type PlatformSettingsPatch = Partial<Omit<PlatformSettingsRow, 'updatedByPlatformAdminId'>>;
