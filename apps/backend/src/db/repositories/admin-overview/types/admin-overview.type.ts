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

/** One switch a `platform_settings_changed` entry changed; `field` is the settings key (`googleLoginEnabled`), the values what it was and became. */
export interface PlatformSettingChange {
  field: string;
  from: boolean;
  to: boolean;
}

/** What `platform_activity_log.details` holds: only `platform_settings_changed` entries have it. */
export interface PlatformActivityDetails {
  changes: PlatformSettingChange[];
  /** Set when the admin confirmed switching a provider off although users could then only sign in with it. */
  lockoutConfirmed?: boolean;
}

export interface PlatformActivityRow {
  id: string;
  type: PlatformActivityType;
  actorEmail: string;
  businessName: string | null;
  targetEmail: string | null;
  details: PlatformActivityDetails | null;
  occurredAt: string;
}

export interface RecordActivityInput {
  type: PlatformActivityType;
  /** Null for the entries no platform admin performed: `BUSINESS_ERASED` (nightly purge cron), `BUSINESS_JOINED` (the owner's own signup, actor = their email) and an owner's own erasure request or cancellation (actor = the label `owner (self-service)`); the column is nullable (`ON DELETE SET NULL`) for that too. */
  actorPlatformAdminId: string | null;
  /** Snapshotted like `businessName`, since the admin row can be deleted. From the request's `AuthUser`, or a literal system-actor string for the cron entry. */
  actorEmail: string;
  tenantId?: string;
  /** Required for `business_*` types (table CHECK); snapshotted so it survives the tenant being deleted or renamed. */
  businessName?: string;
  targetEmail?: string;
  /** Required for `platform_settings_changed` (table CHECK), absent for every other type. */
  details?: PlatformActivityDetails;
}

export interface AdminOverviewStats {
  businessCount: number;
  userCount: number;
  totalReviewsFetched: number;
  totalRepliesSent: number;
}
