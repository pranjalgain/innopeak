import { AuthModule } from '@auth/auth.module';
import { QueueUIModule } from '@bg/queue-ui.module';
import { BillingReconciliationModule } from '@billing/billing-reconciliation.module';
import { BcryptService } from '@common/hashing/bcrypt.service';
import { HashingService } from '@common/hashing/hashing.service';
import { Module } from '@nestjs/common';

import { AdminBillingController } from './controllers/admin-billing.controller';
import { AdminBusinessesController } from './controllers/admin-businesses.controller';
import { AdminOverviewController } from './controllers/admin-overview.controller';
import { AdminSettingsController } from './controllers/admin-settings.controller';
import { AdminStatisticsController } from './controllers/admin-statistics.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminBillingService } from './services/admin-billing.service';
import { AdminBusinessesService } from './services/admin-businesses.service';
import { AdminOverviewService } from './services/admin-overview.service';
import { AdminSettingsService } from './services/admin-settings.service';
import { AdminStatisticsService } from './services/admin-statistics.service';
import { AdminUsersService } from './services/admin-users.service';

@Module({
  imports: [
    QueueUIModule, // for AddingJobsToQueueManager — AdminSettingsService.sendInvite enqueues the invite email
    AuthModule, // for TokenService — AdminSettingsService.updateLocale reissues the access token
    BillingReconciliationModule, // AdminBusinessesService.requestErasure schedules the subscription's cancellation
  ],
  controllers: [
    AdminUsersController,
    AdminBusinessesController,
    AdminSettingsController,
    AdminOverviewController,
    AdminStatisticsController,
    AdminBillingController,
  ],
  providers: [
    AdminUsersService,
    AdminBusinessesService,
    AdminSettingsService,
    AdminOverviewService,
    AdminStatisticsService,
    AdminBillingService,
    { provide: HashingService, useClass: BcryptService },
  ],
})
export class AdminModule {}
