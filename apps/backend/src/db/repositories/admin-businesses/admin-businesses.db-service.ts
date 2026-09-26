import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { BusinessConnectionStatus } from '@common/enums/business-connection-status.enum';
import { BusinessStatus } from '@common/enums/business-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { Injectable } from '@nestjs/common';

import {
  AdminBusinessesRepository,
  type AdminBusinessRow,
  type ConnectionStateRow,
  type SetBusinessStatusInput,
} from './admin-businesses.repository';

export interface AdminBusinessSummary {
  id: string;
  name: string;
  status: BusinessStatus;
  connectionStatus: BusinessConnectionStatus;
  ownerName: string;
  ownerEmail: string;
  userCount: number;
  createdAt: string;
}

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

  async findAll(): Promise<AdminBusinessSummary[]> {
    const rows = await this.adminBusinessesRepository.findAll();
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
   * Sets the tenant's real (3-value) status and returns the mapped summary, or `null` if no such
   * tenant exists. `reactivate` always lands on `TenantStatus.ACTIVE` regardless of whether the
   * tenant was previously `pending_activation` or `active` — both collapse to the same
   * `BusinessStatus.ACTIVE` anyway, so there is nothing to preserve by branching on the prior value.
   */
  async setStatus(input: SetBusinessStatusInput): Promise<AdminBusinessSummary | null> {
    const updated = await this.adminBusinessesRepository.setStatus(input);
    if (!updated) {
      return null;
    }
    const row = await this.adminBusinessesRepository.findById(input.tenantId);
    return row ? toSummary(row) : null;
  }
}

function toSummary(row: AdminBusinessRow): AdminBusinessSummary {
  return {
    id: row.id,
    name: row.name,
    status:
      row.status === TenantStatus.SUSPENDED ? BusinessStatus.SUSPENDED : BusinessStatus.ACTIVE,
    connectionStatus: toConnectionStatus(row),
    // A tenant always has exactly one owner by construction (signup creates it, nothing deletes
    // it) — `?? ''` only guards a tenant whose owner was anonymized separately from the tenant
    // itself, which the product has no path to today but the join can still return.
    ownerName: row.ownerName ?? '',
    ownerEmail: row.ownerEmail ?? '',
    userCount: row.userCount,
    createdAt: row.createdAt,
  };
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
