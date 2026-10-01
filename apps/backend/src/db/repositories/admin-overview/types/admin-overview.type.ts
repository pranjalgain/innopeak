import type { PlatformActivityType } from '@common/enums/platform-activity-type.enum';

// ─── Repository ───────────────────────────────────────────────────────────

export interface PlatformReviewStats {
  totalReviewsFetched: number;
  totalRepliesSent: number;
}

/** One calendar month's tenant-signup count. Only months with at least one signup are returned —
 * `AdminOverviewService.getSignupTrend` fills the zero-count months in the window before responding. */
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
  /**
   * Null for the one system-initiated entry this log carries — `PlatformActivityType.BUSINESS_ERASED`,
   * written by the nightly erasure-purge cron job, which has no human admin behind it. Every other
   * type is genuinely platform-admin-initiated and always supplies a real id; the column itself is
   * nullable (`ON DELETE SET NULL`) for exactly this reason, not only for an admin row later deleted.
   */
  actorPlatformAdminId: string | null;
  /** What the entry renders as its actor, snapshotted for the same reason `businessName` is — the
   * admin row it points at can be deleted, and "who did this" is the one field a log of admin
   * actions cannot afford to lose. Comes straight off the request's `AuthUser`, or a literal
   * system-actor string for the one cron-initiated entry above. */
  actorEmail: string;
  tenantId?: string;
  /** Required for `business_*` types (the table's CHECK enforces it) — this is what the entry
   * renders, snapshotted so it survives the tenant being deleted or renamed. */
  businessName?: string;
  targetEmail?: string;
}

// ─── DB Service ───────────────────────────────────────────────────────────

/** The Overview page's four stat cards, composed from three otherwise-unrelated sources — none of
 * which has its own reason to expose this particular grouping. */
export interface AdminOverviewStats {
  businessCount: number;
  userCount: number;
  totalReviewsFetched: number;
  totalRepliesSent: number;
}
