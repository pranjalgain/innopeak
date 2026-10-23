import { SessionRevocationService } from '@auth/services/session-revocation.service';
import { Module } from '@nestjs/common';
import { RedisModule } from '@redis/redis.module';

import { NotificationsController } from './notifications.controller';
import { NotificationStreamService } from './realtime/notification-stream.service';
import { NotificationsService } from './services/notifications.service';

/** API only: the controller and the open-stream registry. The producers (and the Redis publisher) live in `InAppNotificationsModule`. */
@Module({
  imports: [RedisModule],
  controllers: [NotificationsController],
  // `SessionRevocationService` is stateless beyond the Redis client, so it is provided here rather than importing the whole auth module.
  providers: [NotificationsService, NotificationStreamService, SessionRevocationService],
})
export class NotificationsModule {}
