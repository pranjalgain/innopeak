import type { TenantStatus } from '@auth/enums/tenant-status.enum';
import type { BusinessConnectionStatus } from '@common/enums/business-connection-status.enum';
import type { BusinessStatus } from '@common/enums/business-status.enum';
import type { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';

export interface SetBusinessStatusInput {
  tenantId: string;
  status: TenantStatus;
}

/** `erasure_pending` is distinct from `not_found`: plain suspend/reactivate must not run while an erasure
 *  is pending, or the status change leaves `erasure_requested_at` stale. */
export type SetBusinessStatusOutcome =
  { outcome: 'erasure_pending' } | { outcome: 'not_found' } | { outcome: 'updated' };

export interface AdminBusinessRow {
  id: string;
  name: string;
  status: TenantStatus;
  ownerName: string | null;
  ownerEmail: string | null;
  userCount: number;
  createdAt: string;
  /** Raw status of the most-recent connection row; null if the tenant never connected. */
  latestConnectionStatus: ReviewProviderConnectionStatus | null;
  /** Whether that most-recent connection row is disconnected — `null` alongside `latestConnectionStatus`. */
  latestConnectionDisconnectedAt: string | null;
  /** Set once tenant erasure has been requested — null means no erasure is pending. */
  erasureRequestedAt: string | null;
}

export interface ConnectionStateRow {
  latestConnectionStatus: ReviewProviderConnectionStatus | null;
  latestConnectionDisconnectedAt: string | null;
}

export interface AdminBusinessSummary {
  id: string;
  name: string;
  status: BusinessStatus;
  connectionStatus: BusinessConnectionStatus;
  ownerName: string;
  ownerEmail: string;
  userCount: number;
  createdAt: string;
  erasureRequestedAt: string | null;
}

/** Derived from `SetBusinessStatusOutcome` so a future failure branch cannot be forgotten here; only the
 *  success case is overridden, to carry the mapped summary. */
export type SetBusinessStatusResult =
  | Exclude<SetBusinessStatusOutcome, { outcome: 'updated' }>
  | { outcome: 'updated'; summary: AdminBusinessSummary };
