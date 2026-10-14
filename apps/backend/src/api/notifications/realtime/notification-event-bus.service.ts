import { withTimeout } from '@common/helpers/with-timeout';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { Redis } from 'ioredis';

import type { NotificationStreamEvent, NotificationStreamMessage } from './notification-event.type';
import {
  NOTIFICATION_EVENTS_CHANNEL,
  NOTIFICATION_PUBLISH_CHUNK,
  NOTIFICATION_PUBLISH_TIMEOUT_MS,
} from './notification-stream.constants';

/**
 * The publishing half of the real-time feed: tells every API replica "these users have a new notice". Fire-and-forget by design: Redis
 * pub/sub keeps nothing, so a missed message only costs the browser one poll. Runs in the worker as well as the API, so it depends only
 * on the shared Redis client. Never throws.
 */
@Injectable()
export class NotificationEventBus {
  private readonly logger = new Logger(NotificationEventBus.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async publish(events: NotificationStreamEvent[]): Promise<void> {
    for (let start = 0; start < events.length; start += NOTIFICATION_PUBLISH_CHUNK) {
      const message: NotificationStreamMessage = {
        events: events.slice(start, start + NOTIFICATION_PUBLISH_CHUNK),
      };
      try {
        await withTimeout(
          this.redis.publish(NOTIFICATION_EVENTS_CHANNEL, JSON.stringify(message)),
          NOTIFICATION_PUBLISH_TIMEOUT_MS,
          'notification publish'
        );
      } catch (error) {
        this.logger.warn(
          `Could not publish ${message.events.length} notification event(s); browsers will pick them up by polling: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return;
      }
    }
  }
}
