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
    private readonly configService: ConfigService<EnvConfig>
  ) {}

  /** Public — no `AuthUser` to check, the sign-in/sign-up screens call this before a session
   * exists. */
  async get(): Promise<PlatformSettingsResponseDto> {
    const row = await this.platformSettingsDbService.get();
    if (!row) {
      // The migration seeds this row unconditionally and its id is CHECK-constrained to 1 — this
      // can only happen if the row was manually deleted out from under a running deployment.
      throw new PlatformConfigMissingException();
    }
    const paymentFeatureEnabled =
      this.configService.get<string>('PAYMENT_FEATURE_ENABLED') === 'true';
    return PlatformSettingsResponseDto.from(row, paymentFeatureEnabled);
  }
}
