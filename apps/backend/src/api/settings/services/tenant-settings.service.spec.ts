import { UserRole } from '@auth/enums/user-role.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { TenantSettingsService } from './tenant-settings.service';

import { JwtTokenType } from '../../auth/enums/jwt-token-type.enum';
import type { TenantAuthUser } from '../../auth/types/auth-user.type';

describe('TenantSettingsService', () => {
  let target: TenantSettingsService;
  let settingsDbService: {
    findTenantSettings: jest.Mock;
    updateTenantSettings: jest.Mock;
  };

  const tenantUser: TenantAuthUser = {
    type: JwtTokenType.TENANT_USER,
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'owner@example.com',
    role: UserRole.OWNER,
  };

  const row = {
    id: 'settings-1',
    escalationRatingThreshold: 3,
    autoPostEnabled: false,
    reviewDataRetentionMonths: 24,
    aiReplyCount: 1,
    updatedAt: '2026-08-28T09:12:44.000Z',
  };

  beforeEach(async () => {
    settingsDbService = {
      findTenantSettings: jest.fn(),
      updateTenantSettings: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantSettingsService,
        { provide: SettingsDbService, useValue: settingsDbService },
      ],
    }).compile();

    target = module.get(TenantSettingsService);
  });

  it('returns the singleton for the caller tenant', async () => {
    settingsDbService.findTenantSettings.mockResolvedValue(row);

    const result = await target.get(tenantUser);

    expect(settingsDbService.findTenantSettings).toHaveBeenCalledWith('tenant-1');
    expect(result.escalationRatingThreshold).toBe(3);
  });

  it('404s when the signup row is missing', async () => {
    settingsDbService.findTenantSettings.mockResolvedValue(null);

    await expect(target.get(tenantUser)).rejects.toThrow(NotFoundException);
    await expect(target.get(tenantUser)).rejects.toThrow(MESSAGES.SETTINGS.TENANT_SETTINGS_MISSING);
  });

  it('stores omitted retention as null (platform default)', async () => {
    settingsDbService.updateTenantSettings.mockResolvedValue({
      ...row,
      reviewDataRetentionMonths: null,
    });

    const result = await target.replace(tenantUser, {
      escalationRatingThreshold: 2,
      autoPostEnabled: true,
      aiReplyCount: 1,
    });

    expect(settingsDbService.updateTenantSettings).toHaveBeenCalledWith('tenant-1', {
      escalationRatingThreshold: 2,
      autoPostEnabled: true,
      reviewDataRetentionMonths: null,
      aiReplyCount: 1,
    });
    expect(result.reviewDataRetentionMonths).toBeNull();
  });
});
