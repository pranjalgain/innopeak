import { QueueUIModule } from '@bg/queue-ui.module';
import { Module } from '@nestjs/common';

import { BlocklistTermsController } from './controllers/blocklist-terms.controller';
import { NotificationRecipientsController } from './controllers/notification-recipients.controller';
import { PlatformSettingsController } from './controllers/platform-settings.controller';
import { TenantMembersController } from './controllers/tenant-members.controller';
import { TenantSettingsController } from './controllers/tenant-settings.controller';
import { BlocklistTermsService } from './services/blocklist-terms.service';
import { NotificationRecipientsService } from './services/notification-recipients.service';
import { PlatformSettingsService } from './services/platform-settings.service';
import { TenantMembersService } from './services/tenant-members.service';
import { TenantSettingsService } from './services/tenant-settings.service';

@Module({
  imports: [QueueUIModule], // for AddingJobsToQueueManager — TenantMembersService.sendInvite enqueues the invite email
  controllers: [
    BlocklistTermsController,
    TenantSettingsController,
    TenantMembersController,
    PlatformSettingsController,
    NotificationRecipientsController,
  ],
  providers: [
    BlocklistTermsService,
    TenantSettingsService,
    TenantMembersService,
    PlatformSettingsService,
    NotificationRecipientsService,
  ],
})
export class SettingsModule {}
