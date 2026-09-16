import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { count, desc, eq } from 'drizzle-orm';

export interface PlatformReviewStats {
  totalReviewsFetched: number;
  totalRepliesSent: number;
}

export interface PlatformActivityRow {
  id: string;
  type: PlatformActivityType;
  actorEmail: string;
  businessName: string | null;
  targetEmail: string | null;
  occurredAt: string;
}

export interface RecordActivityInput {
  type: PlatformActivityType;
  actorPlatformAdminId: string;
  /** What the entry renders as its actor, snapshotted for the same reason `businessName` is — the
   * admin row it points at can be deleted, and "who did this" is the one field a log of admin
   * actions cannot afford to lose. Comes straight off the request's `AuthUser`. */
  actorEmail: string;
  tenantId?: string;
  /** Required for `business_*` types (the table's CHECK enforces it) — this is what the entry
   * renders, snapshotted so it survives the tenant being deleted or renamed. */
  businessName?: string;
  targetEmail?: string;
}

const ACTIVITY_COLUMNS = {
  id: schema.platformActivityLog.id,
  type: schema.platformActivityLog.type,
  actorEmail: schema.platformActivityLog.actorEmail,
  // The snapshot taken at write time, not a join against `tenants` — a joined name would vanish
  // when the business is deleted and would silently rewrite itself when the business is renamed.
  businessName: schema.platformActivityLog.businessName,
  targetEmail: schema.platformActivityLog.targetEmail,
  occurredAt: schema.platformActivityLog.occurredAt,
} as const;

/**
 * `reviews`/`review_responses` aggregated platform-wide (no `tenantId` filter — the one place in
 * this codebase those two tables are queried across every tenant at once), plus
 * `platform_activity_log`, a purpose-built log of platform-admin actions (see
 * `0010_admin_overview.sql` for why it's written explicitly rather than trigger-populated).
 */
@Injectable()
export class AdminOverviewRepository {
  constructor(private readonly dbService: DBService) {}

  async getReviewStats(): Promise<PlatformReviewStats> {
    const [reviewRows, replyRows] = await Promise.all([
      this.dbService.db.select({ value: count() }).from(schema.reviews),
      this.dbService.db
        .select({ value: count() })
        .from(schema.reviewResponses)
        .where(eq(schema.reviewResponses.status, ResponseStatus.POSTED)),
    ]);

    return {
      totalReviewsFetched: reviewRows[0]?.value ?? 0,
      totalRepliesSent: replyRows[0]?.value ?? 0,
    };
  }

  async recordActivity(input: RecordActivityInput): Promise<void> {
    await this.dbService.db.insert(schema.platformActivityLog).values({
      type: input.type,
      actorPlatformAdminId: input.actorPlatformAdminId,
      actorEmail: input.actorEmail,
      tenantId: input.tenantId ?? null,
      businessName: input.businessName ?? null,
      targetEmail: input.targetEmail ?? null,
    });
  }

  async getRecentActivity(limit: number): Promise<PlatformActivityRow[]> {
    const rows = await this.dbService.db
      .select(ACTIVITY_COLUMNS)
      // No join to `platform_admins`: every column this returns is stored on the log row itself.
      // An inner join would also have silently dropped entries whose admin has since been deleted
      // — exactly the history the snapshot columns exist to preserve.
      .from(schema.platformActivityLog)
      .orderBy(desc(schema.platformActivityLog.occurredAt), desc(schema.platformActivityLog.id))
      .limit(limit);

    return rows as PlatformActivityRow[];
  }
}
