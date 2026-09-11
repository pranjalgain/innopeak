import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { Injectable, NotFoundException } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth-user.type';
import { TenantSettingsResponseDto } from '../dto/tenant-settings-response.dto';
import { UpdateTenantSettingsDto } from '../dto/update-tenant-settings.dto';

@Injectable()
export class TenantSettingsService {
  constructor(private readonly settingsDbService: SettingsDbService) {}

  async get(user: AuthUser): Promise<TenantSettingsResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.SETTINGS.TENANT_ONLY);
    const row = await this.settingsDbService.findTenantSettings(tenantUser.tenantId);
    if (row === null) {
      throw new NotFoundException(MESSAGES.SETTINGS.TENANT_SETTINGS_MISSING);
    }
    return TenantSettingsResponseDto.from(row);
  }

  async replace(user: AuthUser, dto: UpdateTenantSettingsDto): Promise<TenantSettingsResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.SETTINGS.TENANT_ONLY);
    const row = await this.settingsDbService.updateTenantSettings(tenantUser.tenantId, {
      escalationRatingThreshold: dto.escalationRatingThreshold,
      autoPostEnabled: dto.autoPostEnabled,
      reviewDataRetentionMonths: dto.reviewDataRetentionMonths ?? null,
      aiReplyCount: dto.aiReplyCount,
    });
    if (row === null) {
      throw new NotFoundException(MESSAGES.SETTINGS.TENANT_SETTINGS_MISSING);
    }
    return TenantSettingsResponseDto.from(row);
  }
}
