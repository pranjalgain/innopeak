import { Global, Module } from '@nestjs/common';
import { RedisModule } from '@redis/redis.module';

import { NotificationEventBus } from './realtime/notification-event-bus.service';
import { InAppNotificationsService } from './services/in-app-notifications.service';

/**
 * `@Global()` like `ReviewPipelineModule`: the producers run in both the API and the worker (`WorkerModule` never imports API
 * modules). It needs the already-global `DBModule` and the shared Redis client (to tell open streams about a new notice), and the controller-bearing `NotificationsModule` stays API-only.
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [InAppNotificationsService, NotificationEventBus],
  exports: [InAppNotificationsService],
})
export class InAppNotificationsModule {}
