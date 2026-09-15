import { Module } from '@nestjs/common';

import { BlocklistTermsController } from './controllers/blocklist-terms.controller';
import { PlatformSettingsController } from './controllers/platform-settings.controller';
import { TenantSettingsController } from './controllers/tenant-settings.controller';
import { BlocklistTermsService } from './services/blocklist-terms.service';
import { PlatformSettingsService } from './services/platform-settings.service';
import { TenantSettingsService } from './services/tenant-settings.service';

@Module({
  controllers: [BlocklistTermsController, TenantSettingsController, PlatformSettingsController],
  providers: [BlocklistTermsService, TenantSettingsService, PlatformSettingsService],
})
export class SettingsModule {}
