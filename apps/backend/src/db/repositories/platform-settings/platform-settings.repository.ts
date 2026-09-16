import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

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

const SETTINGS_COLUMNS = {
  ssoLoginEnabled: schema.platformSettings.ssoLoginEnabled,
  passwordLoginEnabled: schema.platformSettings.passwordLoginEnabled,
  socialLoginEnabled: schema.platformSettings.socialLoginEnabled,
  inviteMembersEnabled: schema.platformSettings.inviteMembersEnabled,
  updatedByPlatformAdminId: schema.platformSettings.updatedByPlatformAdminId,
} as const;

/** The table's own CHECK constraint (`platform_settings_id_check`) makes id=1 the only row that
 * can ever exist — every read/write here targets it directly rather than selecting-then-branching. */
const SINGLETON_ID = 1;

/**
 * `platform_settings` — a single, platform-wide row controlling which login methods the
 * sign-in/sign-up screens offer and whether tenant owners can invite teammates. Not tenant-scoped,
 * not platform-admin-scoped: this replaces what used to be build-time `NEXT_PUBLIC_*` env vars.
 */
@Injectable()
export class PlatformSettingsRepository {
  constructor(private readonly dbService: DBService) {}

  async get(): Promise<PlatformSettingsRow | null> {
    const rows = await this.dbService.db
      .select(SETTINGS_COLUMNS)
      .from(schema.platformSettings)
      .where(eq(schema.platformSettings.id, SINGLETON_ID))
      .limit(1);

    return rows[0] ?? null;
  }

  async update(
    patch: PlatformSettingsPatch,
    actorPlatformAdminId: string
  ): Promise<PlatformSettingsRow | null> {
    const rows = await this.dbService.db
      .update(schema.platformSettings)
      .set({ ...patch, updatedByPlatformAdminId: actorPlatformAdminId, updatedAt: sql`now()` })
      .where(eq(schema.platformSettings.id, SINGLETON_ID))
      .returning(SETTINGS_COLUMNS);

    return rows[0] ?? null;
  }
}
