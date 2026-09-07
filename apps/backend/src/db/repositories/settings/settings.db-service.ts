import { Injectable } from '@nestjs/common';

import { BlocklistTermsRepository } from './blocklist-terms.repository';
import { TenantSettingsRepository } from './tenant-settings.repository';

import type { BlocklistTermRecord } from '../../../api/settings/types/blocklist-term.type';
import type {
  TenantSettingsRecord,
  TenantSettingsWrite,
} from '../../../api/settings/types/tenant-settings.type';

@Injectable()
export class SettingsDbService {
  constructor(
    private readonly blocklistTermsRepository: BlocklistTermsRepository,
    private readonly tenantSettingsRepository: TenantSettingsRepository
  ) {}

  async listBlocklistTerms(tenantId: string): Promise<BlocklistTermRecord[]> {
    return this.blocklistTermsRepository.listByTenant(tenantId);
  }

  async insertBlocklistTerm(tenantId: string, term: string): Promise<BlocklistTermRecord | null> {
    return this.blocklistTermsRepository.insertTerm(tenantId, term);
  }

  async deleteBlocklistTerm(id: string, tenantId: string): Promise<boolean> {
    return this.blocklistTermsRepository.deleteForTenant(id, tenantId);
  }

  async findTenantSettings(tenantId: string): Promise<TenantSettingsRecord | null> {
    return this.tenantSettingsRepository.findByTenant(tenantId);
  }

  async updateTenantSettings(
    tenantId: string,
    write: TenantSettingsWrite
  ): Promise<TenantSettingsRecord | null> {
    return this.tenantSettingsRepository.updateForTenant(tenantId, write);
  }

  async findEscalationRatingThreshold(tenantId: string): Promise<number | null> {
    return this.tenantSettingsRepository.findEscalationRatingThreshold(tenantId);
  }

  async findAutoPostEnabled(tenantId: string): Promise<boolean | null> {
    return this.tenantSettingsRepository.findAutoPostEnabled(tenantId);
  }
}
