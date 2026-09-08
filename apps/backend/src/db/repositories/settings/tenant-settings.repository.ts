import { DBService } from '@db/db.service';
import { tenantSettings } from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import type {
  TenantSettingsRecord,
  TenantSettingsWrite,
} from '../../../api/settings/types/tenant-settings.type';

@Injectable()
export class TenantSettingsRepository {
  constructor(private readonly dbService: DBService) {}

  async findByTenant(tenantId: string): Promise<TenantSettingsRecord | null> {
    const rows = await this.dbService.db
      .select({
        id: tenantSettings.id,
        escalationRatingThreshold: tenantSettings.escalationRatingThreshold,
        autoPostEnabled: tenantSettings.autoPostEnabled,
        reviewDataRetentionMonths: tenantSettings.reviewDataRetentionMonths,
        aiReplyCount: tenantSettings.aiReplyCount,
        updatedAt: tenantSettings.updatedAt,
      })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : this.toRecord(row);
  }

  async updateForTenant(
    tenantId: string,
    write: TenantSettingsWrite
  ): Promise<TenantSettingsRecord | null> {
    const rows = await this.dbService.db
      .update(tenantSettings)
      .set({
        escalationRatingThreshold: write.escalationRatingThreshold,
        autoPostEnabled: write.autoPostEnabled,
        reviewDataRetentionMonths: write.reviewDataRetentionMonths,
        aiReplyCount: write.aiReplyCount,
        updatedAt: sql`now()`,
      })
      .where(eq(tenantSettings.tenantId, tenantId))
      .returning({
        id: tenantSettings.id,
        escalationRatingThreshold: tenantSettings.escalationRatingThreshold,
        autoPostEnabled: tenantSettings.autoPostEnabled,
        reviewDataRetentionMonths: tenantSettings.reviewDataRetentionMonths,
        aiReplyCount: tenantSettings.aiReplyCount,
        updatedAt: tenantSettings.updatedAt,
      });

    const row = rows[0];
    return row === undefined ? null : this.toRecord(row);
  }

  async findEscalationRatingThreshold(tenantId: string): Promise<number | null> {
    const rows = await this.dbService.db
      .select({ threshold: tenantSettings.escalationRatingThreshold })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);

    return rows[0]?.threshold ?? null;
  }

  async findAutoPostEnabled(tenantId: string): Promise<boolean | null> {
    const rows = await this.dbService.db
      .select({ autoPostEnabled: tenantSettings.autoPostEnabled })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);

    return rows[0]?.autoPostEnabled ?? null;
  }

  private toRecord(row: {
    id: string;
    escalationRatingThreshold: number;
    autoPostEnabled: boolean;
    reviewDataRetentionMonths: number | null;
    aiReplyCount: number;
    updatedAt: string;
  }): TenantSettingsRecord {
    return {
      id: row.id,
      escalationRatingThreshold: row.escalationRatingThreshold,
      autoPostEnabled: row.autoPostEnabled,
      reviewDataRetentionMonths: row.reviewDataRetentionMonths,
      aiReplyCount: row.aiReplyCount,
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }
}
