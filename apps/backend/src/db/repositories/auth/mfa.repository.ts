import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class MfaRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Finds a user by id, returning their id and email.
   * Returns null if not found.
   */
  async findUserById(userId: string): Promise<{ id: string; email: string } | null> {
    const rows = await this.dbService.db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Finds an MFA setting for a user by type (e.g. 'totp').
   * Returns the setting row or null if not found.
   */
  async findMfaSetting(
    userId: string,
    type: string
  ): Promise<{
    id: string;
    secretEncrypted: string;
    isVerified: boolean;
  } | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.mfaSettings.id,
        secretEncrypted: schema.mfaSettings.secretEncrypted,
        isVerified: schema.mfaSettings.isVerified,
      })
      .from(schema.mfaSettings)
      .where(and(eq(schema.mfaSettings.userId, userId), eq(schema.mfaSettings.type, type)))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Creates or updates an MFA setting for a user.
   * If a setting already exists for the given type, updates the secret and resets verification.
   * Otherwise, inserts a new row.
   */
  async upsertMfaSetting(userId: string, type: string, secretEncrypted: string): Promise<void> {
    const existing = await this.findMfaSetting(userId, type);

    if (existing) {
      await this.dbService.db
        .update(schema.mfaSettings)
        .set({
          secretEncrypted,
          isVerified: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.mfaSettings.id, existing.id));
    } else {
      await this.dbService.db.insert(schema.mfaSettings).values({
        userId,
        type,
        secretEncrypted,
        isVerified: false,
      });
    }
  }

  /**
   * Marks an MFA setting as verified.
   */
  async markMfaVerified(settingId: string): Promise<void> {
    await this.dbService.db
      .update(schema.mfaSettings)
      .set({ isVerified: true, updatedAt: new Date() })
      .where(eq(schema.mfaSettings.id, settingId));
  }

  /**
   * Enables MFA on the user record.
   */
  async enableMfaOnUser(userId: string): Promise<void> {
    await this.dbService.db
      .update(schema.users)
      .set({ mfaEnabled: true, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  /**
   * Updates backup codes for an MFA setting.
   */
  async updateBackupCodes(settingId: string, hashedCodes: string[]): Promise<void> {
    await this.dbService.db
      .update(schema.mfaSettings)
      .set({
        backupCodesHash: hashedCodes,
        updatedAt: new Date(),
      })
      .where(eq(schema.mfaSettings.id, settingId));
  }
}
