import { Injectable } from '@nestjs/common';

import {
  PlatformSettingsRepository,
  type PlatformSettingsRow,
} from './platform-settings.repository';

@Injectable()
export class PlatformSettingsDbService {
  constructor(private readonly platformSettingsRepository: PlatformSettingsRepository) {}

  async get(): Promise<PlatformSettingsRow | null> {
    return this.platformSettingsRepository.get();
  }

  async update(patch: Partial<PlatformSettingsRow>): Promise<PlatformSettingsRow | null> {
    return this.platformSettingsRepository.update(patch);
  }
}
