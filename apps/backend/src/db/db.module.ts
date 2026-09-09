import { DBService } from '@db/db.service';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Repositories — centralized data access layer
import { AuthDbService } from './repositories/auth/auth.db-service';
import { AuthRepository } from './repositories/auth/auth.repository';
import { ConnectionsDbService } from './repositories/connections/connections.db-service';
import { ConnectionsRepository } from './repositories/connections/connections.repository';
import { DashboardRepository } from './repositories/dashboard/dashboard.repository';
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
  ReviewPipelineDbService,
];

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DBService, ...repositories],
  exports: [DBService, ...repositories],
})
export class DBModule {}
