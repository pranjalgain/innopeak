// ─── PlatformSettingsRepository ──────────────────────────────────────────────

export interface PlatformSettingsRow {
  ssoLoginEnabled: boolean;
  passwordLoginEnabled: boolean;
  socialLoginEnabled: boolean;
  inviteMembersEnabled: boolean;
  /** Which platform admin's `update()` call most recently changed this row — null on the seeded
   *  row, before anyone has touched it. Never part of a caller-supplied patch (see
   *  `PlatformSettingsPatch`): `update()` sets it itself, from whoever is actually calling. */
  updatedByPlatformAdminId: string | null;
}

/** What a caller may actually toggle — excludes `updatedByPlatformAdminId`, which `update()`
 *  derives from its own `actorPlatformAdminId` argument rather than trusting the patch to supply. */
export type PlatformSettingsPatch = Partial<Omit<PlatformSettingsRow, 'updatedByPlatformAdminId'>>;
