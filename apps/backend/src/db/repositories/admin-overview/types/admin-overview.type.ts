import type { PlatformActivityType } from '@common/enums/platform-activity-type.enum';

export interface PlatformReviewStats {
  totalReviewsFetched: number;
  totalRepliesSent: number;
}

/** Only months with signups are returned; `AdminOverviewService.getSignupTrend` fills in the zero months. */
export interface SignupTrendPoint {
  year: number;
  /** 1-12. */
  month: number;
  count: number;
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
  /** Null for the one system-initiated entry, `BUSINESS_ERASED` (nightly purge cron, no human admin); the column is nullable (`ON DELETE SET NULL`) for that too. */
  actorPlatformAdminId: string | null;
  /** Snapshotted like `businessName`, since the admin row can be deleted. From the request's `AuthUser`, or a literal system-actor string for the cron entry. */
  actorEmail: string;
  tenantId?: string;
  /** Required for `business_*` types (table CHECK); snapshotted so it survives the tenant being deleted or renamed. */
  businessName?: string;
  targetEmail?: string;
}

export interface AdminOverviewStats {
  businessCount: number;
  userCount: number;
  totalReviewsFetched: number;
  totalRepliesSent: number;
}
