import type { TenantStatus } from '@auth/enums/tenant-status.enum';
import type { BusinessConnectionStatus } from '@common/enums/business-connection-status.enum';
import type { BusinessStatus } from '@common/enums/business-status.enum';
import type { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';

// ─── Repository ───────────────────────────────────────────────────────────

export interface SetBusinessStatusInput {
  tenantId: string;
  status: TenantStatus;
}

/** `erasure_pending` is distinct from `not_found` — the tenant exists, but has a pending erasure
 *  request (`erasure_requested_at` set); plain suspend/reactivate must never run alongside that,
 *  or a later status change leaves the timestamp stale — see `AdminBusinessesRepository.setStatus`. */
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
  /** Raw status of the tenant's most-recent connection row — `null` if it has never connected at all. */
  latestConnectionStatus: ReviewProviderConnectionStatus | null;
  /** Whether that most-recent connection row is disconnected — `null` alongside `latestConnectionStatus`. */
  latestConnectionDisconnectedAt: string | null;
  /** Set once tenant erasure has been requested — null means no erasure is pending. */
  erasureRequestedAt: string | null;
}

/** Just the pair `toConnectionStatus` needs — see `findConnectionStates`. */
export interface ConnectionStateRow {
  latestConnectionStatus: ReviewProviderConnectionStatus | null;
  latestConnectionDisconnectedAt: string | null;
}

// ─── DB Service ───────────────────────────────────────────────────────────

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

/** `AdminBusinessesDbService.setStatus`'s own outcome — derived from `SetBusinessStatusOutcome`
 *  rather than redeclared, so a future failure branch added to the repository's type can never be
 *  forgotten here; only the success case is overridden, carrying the mapped summary instead of
 *  nothing. */
export type SetBusinessStatusResult =
  | Exclude<SetBusinessStatusOutcome, { outcome: 'updated' }>
  | { outcome: 'updated'; summary: AdminBusinessSummary };
