import { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq, isNull, ne, notExists, sql } from 'drizzle-orm';

import type { PlatformSettingsPatch, PlatformSettingsRow } from './types/platform-settings.type';

const SETTINGS_COLUMNS = {
  microsoftLoginEnabled: schema.platformSettings.microsoftLoginEnabled,
  passwordLoginEnabled: schema.platformSettings.passwordLoginEnabled,
  googleLoginEnabled: schema.platformSettings.googleLoginEnabled,
  inviteMembersEnabled: schema.platformSettings.inviteMembersEnabled,
  notificationSettingsEnabled: schema.platformSettings.notificationSettingsEnabled,
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

  /**
   * Active tenant users for whom `provider` is the only way in: no password and no identity with any other provider. Backs the
   * lockout guard in `updatePlatformSettings`: switching the provider off would strand them (there is no admin-side way to give a
   * tenant user a password). Invited, disabled, pending and anonymized users are excluded.
   */
  async countActiveSsoOnlyTenantUsers(provider: UserIdentityProvider): Promise<number> {
    const otherIdentity = this.dbService.db
      .select({ one: sql`1` })
      .from(schema.userIdentities)
      .where(
        and(
          eq(schema.userIdentities.userId, schema.users.id),
          ne(schema.userIdentities.provider, provider)
        )
      );

    const rows = await this.dbService.db
      .select({ value: sql<number>`count(distinct ${schema.users.id})::int` })
      .from(schema.users)
      .innerJoin(
        schema.userIdentities,
        and(
          eq(schema.userIdentities.userId, schema.users.id),
          eq(schema.userIdentities.provider, provider)
        )
      )
      .where(
        and(
          eq(schema.users.status, UserStatus.ACTIVE),
          isNull(schema.users.anonymizedAt),
          isNull(schema.users.passwordHash),
          notExists(otherIdentity)
        )
      );

    return rows[0]?.value ?? 0;
  }
}
