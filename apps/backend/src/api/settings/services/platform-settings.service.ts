import { GoogleIdentityProvider } from '@auth/providers/google-identity.provider';
import { isAdminMicrosoftLoginAvailable } from '@auth/utils/admin-microsoft.util';
import { getErasureGracePeriodDays } from '@common/constants/erasure.constants';
import type { EnvConfig } from '@config/env.config';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PlatformSettingsResponseDto } from '../dto/platform-settings-response.dto';
import { PlatformConfigMissingException } from '../exceptions/settings.exceptions';

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly platformSettingsDbService: PlatformSettingsDbService,
    private readonly configService: ConfigService<EnvConfig>,
    private readonly googleIdentityProvider: GoogleIdentityProvider
  ) {}

  /** Public: the sign-in/sign-up screens call this before a session exists. */
  async get(): Promise<PlatformSettingsResponseDto> {
    const row = await this.platformSettingsDbService.get();
    if (!row) {
      // The migration seeds this row (id CHECK-constrained to 1); missing means it was manually deleted.
      throw new PlatformConfigMissingException();
    }
    const paymentFeatureEnabled =
      this.configService.get<string>('PAYMENT_FEATURE_ENABLED') === 'true';
    return PlatformSettingsResponseDto.from(row, {
      paymentFeatureEnabled,
      erasureGracePeriodDays: getErasureGracePeriodDays(this.configService),
      adminMicrosoftLoginAvailable: isAdminMicrosoftLoginAvailable(this.configService),
      adminGoogleLoginAvailable: this.googleIdentityProvider.isConfigured(),
    });
  }
}
