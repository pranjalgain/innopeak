import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import type { PlatformSettingsPatch, PlatformSettingsRow } from './types/platform-settings.type';

const SETTINGS_COLUMNS = {
  ssoLoginEnabled: schema.platformSettings.ssoLoginEnabled,
  passwordLoginEnabled: schema.platformSettings.passwordLoginEnabled,
  socialLoginEnabled: schema.platformSettings.socialLoginEnabled,
  inviteMembersEnabled: schema.platformSettings.inviteMembersEnabled,
  updatedByPlatformAdminId: schema.platformSettings.updatedByPlatformAdminId,
} as const;

/** `platform_settings_id_check` makes id=1 the only possible row, so reads/writes target it directly. */
const SINGLETON_ID = 1;

/** The single platform-wide row of login-method and invite toggles; not tenant- or platform-admin-scoped. */
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
