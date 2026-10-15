import { DEFAULT_ERASURE_GRACE_PERIOD_DAYS } from '@common/constants/erasure.constants';
import { MESSAGES } from '@common/constants/messages.constants';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PlatformSettingsService } from './platform-settings.service';

/** A `ConfigService.get` stand-in answering only the keys given, like an environment that sets just those. */
const configWith =
  (values: Record<string, unknown>) =>
  (key: string): unknown =>
    values[key];

describe('PlatformSettingsService', () => {
  let target: PlatformSettingsService;
  let platformSettingsDbService: { get: jest.Mock };
  let configService: { get: jest.Mock };

  const row = {
    microsoftLoginEnabled: true,
    passwordLoginEnabled: false,
    googleLoginEnabled: false,
    inviteMembersEnabled: false,
    notificationSettingsEnabled: false,
    updatedByPlatformAdminId: null,
  };

  beforeEach(async () => {
    platformSettingsDbService = { get: jest.fn() };
    configService = {
      get: jest.fn((key: string) => (key === 'PAYMENT_FEATURE_ENABLED' ? 'false' : undefined)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformSettingsService,
        { provide: PlatformSettingsDbService, useValue: platformSettingsDbService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    target = module.get(PlatformSettingsService);
  });

  it('returns the singleton row with no AuthUser required', async () => {
    platformSettingsDbService.get.mockResolvedValue(row);

    const result = await target.get();

    expect(result.microsoftLoginEnabled).toBe(true);
    expect(result.passwordLoginEnabled).toBe(false);
  });

  it('throws a 500 if the seeded singleton row is somehow missing', async () => {
    platformSettingsDbService.get.mockResolvedValue(null);

    await expect(target.get()).rejects.toThrow(InternalServerErrorException);
    await expect(target.get()).rejects.toThrow(MESSAGES.SETTINGS.PLATFORM_CONFIG_MISSING);
  });

  // The route is `@Public()` and the DTO is shared with the admin-only PATCH, so the DTO is all that
  // keeps `updated_by_platform_admin_id` off an unauthenticated response. Exact key set (not a
  // `not.toHaveProperty`) so any column newly mapped in `from()` fails here.
  it('exposes only the eight public settings — never the internal actor id', async () => {
    platformSettingsDbService.get.mockResolvedValue(row);

    const result = await target.get();

    expect(Object.keys(result).sort()).toEqual([
      'adminMicrosoftLoginAvailable',
      'erasureGracePeriodDays',
      'googleLoginEnabled',
      'inviteMembersEnabled',
      'microsoftLoginEnabled',
      'notificationSettingsEnabled',
      'passwordLoginEnabled',
      'paymentFeatureEnabled',
    ]);
  });

  it(
    'reflects PAYMENT_FEATURE_ENABLED, not any DB column — there is deliberately no ' +
      'runtime-toggleable copy of this flag',
    async () => {
      platformSettingsDbService.get.mockResolvedValue(row);
      configService.get.mockImplementation(configWith({ PAYMENT_FEATURE_ENABLED: 'true' }));

      const result = await target.get();

      expect(result.paymentFeatureEnabled).toBe(true);
    }
  );

  it('reports the deploy erasure grace period, falling back to the shared default', async () => {
    platformSettingsDbService.get.mockResolvedValue(row);

    expect((await target.get()).erasureGracePeriodDays).toBe(DEFAULT_ERASURE_GRACE_PERIOD_DAYS);

    configService.get.mockImplementation(
      configWith({ PAYMENT_FEATURE_ENABLED: 'false', ERASURE_GRACE_PERIOD_DAYS: 1 })
    );
    expect((await target.get()).erasureGracePeriodDays).toBe(1);
  });

  // Derived from the environment alone: the Microsoft client AND a pinned directory.
  it('offers admin Microsoft sign-in only when the client is configured and a directory is pinned', async () => {
    platformSettingsDbService.get.mockResolvedValue(row);
    const full = {
      ADMIN_MICROSOFT_TENANT_ID: '3f2b8c1e-5a47-4d90-8e6b-0c1d2e3f4a5b',
      MICROSOFT_CLIENT_ID: 'id',
      MICROSOFT_CLIENT_SECRET: 'secret',
      MICROSOFT_CALLBACK_URL: 'https://app.test/v1/auth/microsoft/callback',
    };

    expect((await target.get()).adminMicrosoftLoginAvailable).toBe(false);

    configService.get.mockImplementation(configWith(full));
    expect((await target.get()).adminMicrosoftLoginAvailable).toBe(true);

    configService.get.mockImplementation(configWith({ ...full, ADMIN_MICROSOFT_TENANT_ID: '' }));
    expect((await target.get()).adminMicrosoftLoginAvailable).toBe(false);

    configService.get.mockImplementation(configWith({ ...full, MICROSOFT_CLIENT_SECRET: '' }));
    expect((await target.get()).adminMicrosoftLoginAvailable).toBe(false);
  });
});
