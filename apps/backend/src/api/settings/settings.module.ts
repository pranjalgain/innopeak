import { Module } from '@nestjs/common';

import { BlocklistTermsController } from './controllers/blocklist-terms.controller';
import { TenantSettingsController } from './controllers/tenant-settings.controller';
import { BlocklistTermsService } from './services/blocklist-terms.service';
import { TenantSettingsService } from './services/tenant-settings.service';

@Module({
  controllers: [BlocklistTermsController, TenantSettingsController],
  providers: [BlocklistTermsService, TenantSettingsService],
})
export class SettingsModule {}
