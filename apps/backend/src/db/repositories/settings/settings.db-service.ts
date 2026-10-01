import { Injectable } from '@nestjs/common';

import { BlocklistTermsRepository } from './blocklist-terms.repository';
import { NotificationRecipientsRepository } from './notification-recipients.repository';
import { TenantSettingsRepository } from './tenant-settings.repository';

import type {
  BlocklistTermRecord,
  CreateBlocklistTermInput,
  DeleteBlocklistTermInput,
  NotificationRecipientRecord,
  TenantSettingsRecord,
  TenantSettingsWrite,
  UpdateNotificationRecipientInput,
} from '../../../api/settings/types/settings.type';

@Injectable()
export class SettingsDbService {
  constructor(
    private readonly blocklistTermsRepository: BlocklistTermsRepository,
    private readonly tenantSettingsRepository: TenantSettingsRepository,
    private readonly notificationRecipientsRepository: NotificationRecipientsRepository
  ) {}

  async listBlocklistTerms(tenantId: string): Promise<BlocklistTermRecord[]> {
    return this.blocklistTermsRepository.listByTenant(tenantId);
  }

  async insertBlocklistTerm(input: CreateBlocklistTermInput): Promise<BlocklistTermRecord | null> {
    return this.blocklistTermsRepository.insertTerm(input);
  }

  async deleteBlocklistTerm(input: DeleteBlocklistTermInput): Promise<boolean> {
    return this.blocklistTermsRepository.deleteForTenant(input);
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

  async listNotificationRecipients(tenantId: string): Promise<NotificationRecipientRecord[]> {
    return this.notificationRecipientsRepository.listByTenant(tenantId);
  }

  async updateNotificationRecipient(
    input: UpdateNotificationRecipientInput
  ): Promise<NotificationRecipientRecord | null> {
    return this.notificationRecipientsRepository.updateForTenant(input);
  }
}
