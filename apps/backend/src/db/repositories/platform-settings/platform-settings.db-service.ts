import { Injectable } from '@nestjs/common';

import {
  type PlatformSettingsPatch,
  PlatformSettingsRepository,
  type PlatformSettingsRow,
} from './platform-settings.repository';

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
