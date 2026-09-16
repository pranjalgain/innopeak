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
    updatedByPlatformAdminId: null,
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

  /**
   * This route is `@Public()` — the sign-in screen calls it before any session exists — so the
   * response is world-readable and must carry nothing but the four feature toggles.
   * `platform_settings.updated_by_platform_admin_id` is deliberately not among them: it is an
   * internal `platform_admins.id`, and `PlatformSettingsResponseDto` is shared verbatim with the
   * admin-only PATCH, so the DTO is the only thing standing between that column and an
   * unauthenticated caller.
   *
   * Asserted as an exact key set rather than a `not.toHaveProperty` on today's one risky field:
   * the boundary that matters is "nothing new leaks here by accident", and `from()` whitelists by
   * explicit assignment, so any future column that gets mapped in shows up as a new key and fails
   * this. Without it, adding two innocuous-looking lines to `from()` republished an internal id on
   * a public endpoint with every existing test still green.
   */
  it('exposes only the four public toggles — never the internal actor id', async () => {
    platformSettingsDbService.get.mockResolvedValue(row);

    const result = await target.get();

    expect(Object.keys(result).sort()).toEqual([
      'inviteMembersEnabled',
      'passwordLoginEnabled',
      'socialLoginEnabled',
      'ssoLoginEnabled',
    ]);
  });
});
