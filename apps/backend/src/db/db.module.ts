import { DBService } from '@db/db.service';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Repositories — centralized data access layer
import { AdminBusinessesDbService } from './repositories/admin-businesses/admin-businesses.db-service';
import { AdminBusinessesRepository } from './repositories/admin-businesses/admin-businesses.repository';
import { AdminOverviewDbService } from './repositories/admin-overview/admin-overview.db-service';
import { AdminOverviewRepository } from './repositories/admin-overview/admin-overview.repository';
import { AdminUsersDbService } from './repositories/admin-users/admin-users.db-service';
import { AdminUsersRepository } from './repositories/admin-users/admin-users.repository';
import { AuthDbService } from './repositories/auth/auth.db-service';
import { AuthRepository } from './repositories/auth/auth.repository';
import { ConnectionsDbService } from './repositories/connections/connections.db-service';
import { ConnectionsRepository } from './repositories/connections/connections.repository';
import { DashboardDbService } from './repositories/dashboard/dashboard.db-service';
import { DashboardRepository } from './repositories/dashboard/dashboard.repository';
import { DemoDataDbService } from './repositories/demo-data/demo-data.db-service';
import { DemoDataRepository } from './repositories/demo-data/demo-data.repository';
import { PlatformAdminDbService } from './repositories/platform-admin/platform-admin.db-service';
import { PlatformAdminRepository } from './repositories/platform-admin/platform-admin.repository';
import { PlatformSettingsDbService } from './repositories/platform-settings/platform-settings.db-service';
import { PlatformSettingsRepository } from './repositories/platform-settings/platform-settings.repository';
import { PromptsDbService } from './repositories/prompts/prompts.db-service';
import { PromptsRepository } from './repositories/prompts/prompts.repository';
import { ReviewPipelineDbService } from './repositories/review-pipeline/review-pipeline.db-service';
import { ReviewSyncDbService } from './repositories/review-sync/review-sync.db-service';
import { ReviewSyncRepository } from './repositories/review-sync/review-sync.repository';
import { ReviewsReadRepository } from './repositories/review-sync/reviews-read.repository';
import { BlocklistTermsRepository } from './repositories/settings/blocklist-terms.repository';
import { SettingsDbService } from './repositories/settings/settings.db-service';
import { TenantSettingsRepository } from './repositories/settings/tenant-settings.repository';

const repositories = [
  AuthRepository,
  AuthDbService,
  ConnectionsRepository,
  ConnectionsDbService,
  PromptsRepository,
  PromptsDbService,
  ReviewSyncRepository,
  ReviewsReadRepository,
  ReviewSyncDbService,
  BlocklistTermsRepository,
  TenantSettingsRepository,
  SettingsDbService,
  DashboardRepository,
  DashboardDbService,
  DemoDataRepository,
  DemoDataDbService,
  ReviewPipelineDbService,
  AdminUsersRepository,
  AdminUsersDbService,
  AdminBusinessesRepository,
  AdminBusinessesDbService,
  AdminOverviewRepository,
  AdminOverviewDbService,
  PlatformAdminRepository,
  PlatformAdminDbService,
  PlatformSettingsRepository,
  PlatformSettingsDbService,
];

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DBService, ...repositories],
  exports: [DBService, ...repositories],
})
export class DBModule {}
