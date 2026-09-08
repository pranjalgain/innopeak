import { MESSAGES } from '@common/constants/messages.constants';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { JwtTokenType } from '../../auth/enums/jwt-token-type.enum';
import type { AuthUser, TenantAuthUser } from '../../auth/types/auth-user.type';
import { TenantSettingsResponseDto } from '../dto/tenant-settings-response.dto';
import { UpdateTenantSettingsDto } from '../dto/update-tenant-settings.dto';

@Injectable()
export class TenantSettingsService {
  constructor(private readonly settingsDbService: SettingsDbService) {}

  async get(user: AuthUser): Promise<TenantSettingsResponseDto> {
    const tenantUser = this.requireTenantUser(user);
    const row = await this.settingsDbService.findTenantSettings(tenantUser.tenantId);
    if (row === null) {
      throw new NotFoundException(MESSAGES.SETTINGS.TENANT_SETTINGS_MISSING);
    }
    return TenantSettingsResponseDto.from(row);
  }

  async replace(user: AuthUser, dto: UpdateTenantSettingsDto): Promise<TenantSettingsResponseDto> {
    const tenantUser = this.requireTenantUser(user);
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

  private requireTenantUser(user: AuthUser): TenantAuthUser {
    if (user.type !== JwtTokenType.TENANT_USER) {
      throw new ForbiddenException(MESSAGES.SETTINGS.TENANT_ONLY);
    }
    return user;
  }
}
