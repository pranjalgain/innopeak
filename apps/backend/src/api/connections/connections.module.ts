import { BillingModule } from '@billing/billing.module';
import { Module } from '@nestjs/common';
import { RedisModule } from '@redis/redis.module';
import { ReviewSyncQueueUIModule } from '@review-sync-queue/review-sync-queue-ui.module';

import { ConnectionsSyncController } from './controllers/connections-sync.controller';
import { ConnectionsController } from './controllers/connections.controller';
import { ConnectionsSyncService } from './services/connections-sync.service';
import { ConnectionsService } from './services/connections.service';
import { OAuthStateService } from './services/oauth-state.service';

/**
 * `ReviewProviderModule` and `DBModule` are `@Global()`, so they resolve without import; `BillingModule` is not.
 * `ReviewSyncQueueUIModule` provides the producer: the API publishes the backfill job, the worker consumes it.
 */
@Module({
  imports: [RedisModule, ReviewSyncQueueUIModule, BillingModule],
  controllers: [ConnectionsController, ConnectionsSyncController],
  providers: [ConnectionsService, ConnectionsSyncService, OAuthStateService],
})
export class ConnectionsModule {}
