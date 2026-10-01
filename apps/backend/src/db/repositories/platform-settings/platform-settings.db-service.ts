import { Injectable } from '@nestjs/common';

import { PlatformSettingsRepository } from './platform-settings.repository';
import type { PlatformSettingsPatch, PlatformSettingsRow } from './types/platform-settings.type';

@Injectable()
export class PlatformSettingsDbService {
  constructor(private readonly platformSettingsRepository: PlatformSettingsRepository) {}

  async get(): Promise<PlatformSettingsRow | null> {
    return this.platformSettingsRepository.get();
  }

  async update(
    patch: PlatformSettingsPatch,
    actorPlatformAdminId: string
  ): Promise<PlatformSettingsRow | null> {
    return this.platformSettingsRepository.update(patch, actorPlatformAdminId);
  }
}
