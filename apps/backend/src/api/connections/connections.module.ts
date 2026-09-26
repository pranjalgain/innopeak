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
 * `ReviewProviderModule` and `DBModule` are both `@Global()`, so the Google client, credential
 * store and both DB services resolve without being imported here. `ReviewSyncQueueUIModule` is
 * imported for its producer (`ReviewSyncQueue`) — the API process publishes the backfill job, the
 * worker process consumes it. `BillingModule` is imported for `BillingEntitlementsService` —
 * unlike the DB services above, that's real business logic living in its own module, so (unlike
 * the `@Global()` ones) it has to be imported explicitly.
 */
@Module({
  imports: [RedisModule, ReviewSyncQueueUIModule, BillingModule],
  controllers: [ConnectionsController, ConnectionsSyncController],
  providers: [ConnectionsService, ConnectionsSyncService, OAuthStateService],
})
export class ConnectionsModule {}
