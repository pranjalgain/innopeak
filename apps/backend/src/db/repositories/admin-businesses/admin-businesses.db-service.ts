import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { BusinessConnectionStatus } from '@common/enums/business-connection-status.enum';
import { BusinessStatus } from '@common/enums/business-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { Injectable } from '@nestjs/common';

import { AdminBusinessesRepository } from './admin-businesses.repository';
import type {
  AdminBusinessRow,
  AdminBusinessSummary,
  ConnectionStateRow,
  SetBusinessStatusInput,
  SetBusinessStatusResult,
} from './types/admin-businesses.type';

@Injectable()
export class AdminBusinessesDbService {
  constructor(private readonly adminBusinessesRepository: AdminBusinessesRepository) {}

  /** Every tenant's connection status, resolved through the same `toConnectionStatus` the
   *  Businesses list itself uses — one definition, so the Statistics page's connection-health
   *  tally can never disagree with what the list shows for the same tenants. */
  async listConnectionStatuses(): Promise<BusinessConnectionStatus[]> {
    const rows = await this.adminBusinessesRepository.findConnectionStates();
    return rows.map(toConnectionStatus);
  }

  async findAll(search?: string): Promise<AdminBusinessSummary[]> {
    const rows = await this.adminBusinessesRepository.findAll(search);
    return rows.map(toSummary);
  }

  /** Total tenant count — passed straight through, there is no row to map. */
  async count(): Promise<number> {
    return this.adminBusinessesRepository.count();
  }

  /** The most recently created tenants, mapped the same way `findAll` is. */
  async findRecent(limit: number): Promise<AdminBusinessSummary[]> {
    const rows = await this.adminBusinessesRepository.findRecent(limit);
    return rows.map(toSummary);
  }

  /** The tenants needing attention, already filtered/ordered/capped in SQL — see
   *  `AdminBusinessesRepository.findNeedingAttention`'s own comment. */
  async findNeedingAttention(limit: number): Promise<AdminBusinessSummary[]> {
    const rows = await this.adminBusinessesRepository.findNeedingAttention(limit);
    return rows.map(toSummary);
  }

  /**
   * Sets the tenant's real (3-value) status, or refuses when the tenant doesn't exist or has a
   * pending erasure request — see `AdminBusinessesRepository.setStatus`. `reactivate` always lands
   * on `TenantStatus.ACTIVE` regardless of whether the tenant was previously `pending_activation`
   * or `active` — both collapse to the same `BusinessStatus.ACTIVE` anyway, so there is nothing to
   * preserve by branching on the prior value.
   */
  async setStatus(input: SetBusinessStatusInput): Promise<SetBusinessStatusResult> {
    const outcome = await this.adminBusinessesRepository.setStatus(input);
    if (outcome.outcome !== 'updated') {
      return outcome;
    }
    const row = await this.adminBusinessesRepository.findById(input.tenantId);
    return row ? { outcome: 'updated', summary: toSummary(row) } : { outcome: 'not_found' };
  }

  /** See `AdminBusinessesRepository.requestErasure` — same re-read-and-map shape as `setStatus`. */
  async requestErasure(tenantId: string): Promise<AdminBusinessSummary | null> {
    const updated = await this.adminBusinessesRepository.requestErasure(tenantId);
    if (!updated) {
      return null;
    }
    const row = await this.adminBusinessesRepository.findById(tenantId);
    return row ? toSummary(row) : null;
  }

  /** See `AdminBusinessesRepository.cancelErasure`. */
  async cancelErasure(tenantId: string): Promise<AdminBusinessSummary | null> {
    const updated = await this.adminBusinessesRepository.cancelErasure(tenantId);
    if (!updated) {
      return null;
    }
    const row = await this.adminBusinessesRepository.findById(tenantId);
    return row ? toSummary(row) : null;
  }
}

function toSummary(row: AdminBusinessRow): AdminBusinessSummary {
  return {
    id: row.id,
    name: row.name,
    status: toBusinessStatus(row.status),
    connectionStatus: toConnectionStatus(row),
    // A tenant always has exactly one owner by construction (signup creates it, nothing deletes
    // it) — `?? ''` only guards a tenant whose owner was anonymized separately from the tenant
    // itself, which the product has no path to today but the join can still return.
    ownerName: row.ownerName ?? '',
    ownerEmail: row.ownerEmail ?? '',
    userCount: row.userCount,
    createdAt: row.createdAt,
    erasureRequestedAt: row.erasureRequestedAt,
  };
}

/** `pending_activation` collapses into `active` (a tenant mid-onboarding is not suspended); every
 *  other `TenantStatus` value maps straight across. During the erasure grace period a tenant still
 *  reads as `suspended` here — see `tenants.erasure_requested_at`'s own comment — so `erased` only
 *  ever shows once the nightly purge job has actually flipped the underlying column. */
function toBusinessStatus(status: TenantStatus): BusinessStatus {
  if (status === TenantStatus.SUSPENDED) return BusinessStatus.SUSPENDED;
  if (status === TenantStatus.ERASED) return BusinessStatus.ERASED;
  return BusinessStatus.ACTIVE;
}

/** Takes only the latest-connection pair, not a whole `AdminBusinessRow` — `AdminBusinessRow`
 *  structurally satisfies it, so the full-list mapping still passes its rows straight in, while
 *  `listConnectionStatuses` can reuse this from the lean projection. */
function toConnectionStatus(row: ConnectionStateRow): BusinessConnectionStatus {
  // No connection row has ever existed for this tenant — distinct from having lost one, see the
  // enum's own comment.
  if (row.latestConnectionStatus === null) {
    return BusinessConnectionStatus.NEVER_CONNECTED;
  }
  if (row.latestConnectionDisconnectedAt !== null) {
    return BusinessConnectionStatus.DISCONNECTED;
  }
  return row.latestConnectionStatus === ReviewProviderConnectionStatus.NEEDS_REAUTH
    ? BusinessConnectionStatus.NEEDS_REAUTH
    : BusinessConnectionStatus.CONNECTED;
}
