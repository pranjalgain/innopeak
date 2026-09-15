import { MESSAGES } from '@common/constants/messages.constants';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import { InternalServerErrorException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PlatformSettingsService } from './platform-settings.service';

describe('PlatformSettingsService', () => {
  let target: PlatformSettingsService;
  let platformSettingsDbService: { get: jest.Mock };

  const row = {
    ssoLoginEnabled: true,
    passwordLoginEnabled: false,
    socialLoginEnabled: false,
    inviteMembersEnabled: false,
  };

  beforeEach(async () => {
    platformSettingsDbService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformSettingsService,
        { provide: PlatformSettingsDbService, useValue: platformSettingsDbService },
      ],
    }).compile();

    target = module.get(PlatformSettingsService);
  });

  it('returns the singleton row with no AuthUser required', async () => {
    platformSettingsDbService.get.mockResolvedValue(row);

    const result = await target.get();

    expect(result.ssoLoginEnabled).toBe(true);
    expect(result.passwordLoginEnabled).toBe(false);
  });

  it('throws a 500 if the seeded singleton row is somehow missing', async () => {
    platformSettingsDbService.get.mockResolvedValue(null);

    await expect(target.get()).rejects.toThrow(InternalServerErrorException);
    await expect(target.get()).rejects.toThrow(MESSAGES.SETTINGS.PLATFORM_CONFIG_MISSING);
  });
});
