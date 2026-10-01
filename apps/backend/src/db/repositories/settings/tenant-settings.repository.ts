import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import type {
  TenantSettingsRecord,
  TenantSettingsWrite,
} from '../../../api/settings/types/settings.type';

@Injectable()
export class TenantSettingsRepository {
  constructor(private readonly dbService: DBService) {}

  async findByTenant(tenantId: string): Promise<TenantSettingsRecord | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.tenantSettings.id,
        escalationRatingThreshold: schema.tenantSettings.escalationRatingThreshold,
        autoPostEnabled: schema.tenantSettings.autoPostEnabled,
        reviewDataRetentionMonths: schema.tenantSettings.reviewDataRetentionMonths,
        aiReplyCount: schema.tenantSettings.aiReplyCount,
        updatedAt: schema.tenantSettings.updatedAt,
      })
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.tenantId, tenantId))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : this.toRecord(row);
  }

  async updateForTenant(
    tenantId: string,
    write: TenantSettingsWrite
  ): Promise<TenantSettingsRecord | null> {
    const rows = await this.dbService.db
      .update(schema.tenantSettings)
      .set({
        escalationRatingThreshold: write.escalationRatingThreshold,
        autoPostEnabled: write.autoPostEnabled,
        reviewDataRetentionMonths: write.reviewDataRetentionMonths,
        aiReplyCount: write.aiReplyCount,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.tenantSettings.tenantId, tenantId))
      .returning({
        id: schema.tenantSettings.id,
        escalationRatingThreshold: schema.tenantSettings.escalationRatingThreshold,
        autoPostEnabled: schema.tenantSettings.autoPostEnabled,
        reviewDataRetentionMonths: schema.tenantSettings.reviewDataRetentionMonths,
        aiReplyCount: schema.tenantSettings.aiReplyCount,
        updatedAt: schema.tenantSettings.updatedAt,
      });

    const row = rows[0];
    return row === undefined ? null : this.toRecord(row);
  }

  async findEscalationRatingThreshold(tenantId: string): Promise<number | null> {
    const rows = await this.dbService.db
      .select({ threshold: schema.tenantSettings.escalationRatingThreshold })
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.tenantId, tenantId))
      .limit(1);

    return rows[0]?.threshold ?? null;
  }

  async findAutoPostEnabled(tenantId: string): Promise<boolean | null> {
    const rows = await this.dbService.db
      .select({ autoPostEnabled: schema.tenantSettings.autoPostEnabled })
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.tenantId, tenantId))
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
