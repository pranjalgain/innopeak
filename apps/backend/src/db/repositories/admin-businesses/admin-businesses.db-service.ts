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

  /** One definition shared with the Businesses list, so the Statistics connection-health tally cannot disagree with it. */
  async listConnectionStatuses(): Promise<BusinessConnectionStatus[]> {
    const rows = await this.adminBusinessesRepository.findConnectionStates();
    return rows.map(toConnectionStatus);
  }

  async findPage(input: {
    search?: string | undefined;
    page: number;
    pageSize: number;
  }): Promise<{ businesses: AdminBusinessSummary[]; total: number }> {
    const { rows, total } = await this.adminBusinessesRepository.findPage(input);
    return { businesses: rows.map(toSummary), total };
  }

  async count(): Promise<number> {
    return this.adminBusinessesRepository.count();
  }

  async findRecent(limit: number): Promise<AdminBusinessSummary[]> {
    const rows = await this.adminBusinessesRepository.findRecent(limit);
    return rows.map(toSummary);
  }

  async findNeedingAttention(limit: number): Promise<AdminBusinessSummary[]> {
    const rows = await this.adminBusinessesRepository.findNeedingAttention(limit);
    return rows.map(toSummary);
  }

  /** Refuses when the tenant is missing or has a pending erasure. Reactivating always lands on ACTIVE: `pending_activation` and `active` both map to `BusinessStatus.ACTIVE`. */
  async setStatus(input: SetBusinessStatusInput): Promise<SetBusinessStatusResult> {
    const outcome = await this.adminBusinessesRepository.setStatus(input);
    if (outcome.outcome !== 'updated') {
      return outcome;
    }
    const row = await this.adminBusinessesRepository.findById(input.tenantId);
    return row ? { outcome: 'updated', summary: toSummary(row) } : { outcome: 'not_found' };
  }

  async requestErasure(tenantId: string): Promise<AdminBusinessSummary | null> {
    const updated = await this.adminBusinessesRepository.requestErasure(tenantId);
    if (!updated) {
      return null;
    }
    const row = await this.adminBusinessesRepository.findById(tenantId);
    return row ? toSummary(row) : null;
  }

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
    // `?? ''` only guards an owner anonymized separately from the tenant, which the join can still return.
    ownerName: row.ownerName ?? '',
    ownerEmail: row.ownerEmail ?? '',
    userCount: row.userCount,
    createdAt: row.createdAt,
    erasureRequestedAt: row.erasureRequestedAt,
  };
}

/** `pending_activation` collapses into `active`. During the erasure grace period a tenant still reads as
 *  `suspended`; `erased` shows only once the nightly purge flips the underlying column. */
function toBusinessStatus(status: TenantStatus): BusinessStatus {
  if (status === TenantStatus.SUSPENDED) return BusinessStatus.SUSPENDED;
  if (status === TenantStatus.ERASED) return BusinessStatus.ERASED;
  return BusinessStatus.ACTIVE;
}

/** Takes only the latest-connection pair so `listConnectionStatuses` can reuse it from the lean projection;
 *  `AdminBusinessRow` satisfies it structurally. */
function toConnectionStatus(row: ConnectionStateRow): BusinessConnectionStatus {
  // Never connected, as distinct from having lost a connection.
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
