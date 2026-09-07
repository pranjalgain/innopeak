import { DBService } from '@db/db.service';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Repositories — centralized data access layer
import { AuthDbService } from './repositories/auth/auth.db-service';
import { AuthRepository } from './repositories/auth/auth.repository';
import { ConnectionsDbService } from './repositories/connections/connections.db-service';
import { ConnectionsRepository } from './repositories/connections/connections.repository';
import { PromptsDbService } from './repositories/prompts/prompts.db-service';
import { PromptsRepository } from './repositories/prompts/prompts.repository';
import { ReviewSyncDbService } from './repositories/review-sync/review-sync.db-service';
import { ReviewSyncRepository } from './repositories/review-sync/review-sync.repository';
import { ReviewsReadRepository } from './repositories/review-sync/reviews-read.repository';

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
];

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DBService, ...repositories],
  exports: [DBService, ...repositories],
})
export class DBModule {}
