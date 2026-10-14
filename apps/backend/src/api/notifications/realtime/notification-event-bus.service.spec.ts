import type { Redis } from 'ioredis';

import { NotificationEventBus } from './notification-event-bus.service';
import {
  NOTIFICATION_EVENTS_CHANNEL,
  NOTIFICATION_PUBLISH_CHUNK,
} from './notification-stream.constants';

const events = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ userId: `user-${i}`, notificationId: `notice-${i}` }));

describe('NotificationEventBus', () => {
  let publish: jest.Mock;
  let target: NotificationEventBus;

  beforeEach(() => {
    publish = jest.fn().mockResolvedValue(1);
    target = new NotificationEventBus({ publish } as unknown as Redis);
  });

  it('publishes ids only, as JSON, on the shared channel', async () => {
    await target.publish(events(2));

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      NOTIFICATION_EVENTS_CHANNEL,
      JSON.stringify({ events: events(2) })
    );
  });

  it('does nothing for no events', async () => {
    await target.publish([]);

    expect(publish).not.toHaveBeenCalled();
  });

  it('splits a large tenant-wide notice into several small messages', async () => {
    await target.publish(events(NOTIFICATION_PUBLISH_CHUNK * 2 + 1));

    expect(publish).toHaveBeenCalledTimes(3);
  });

  it('never throws when Redis refuses, and stops trying the rest', async () => {
    publish.mockRejectedValue(new Error('redis down'));

    await expect(target.publish(events(NOTIFICATION_PUBLISH_CHUNK * 2))).resolves.toBeUndefined();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('never throws when Redis does not answer in time', async () => {
    jest.useFakeTimers();
    publish.mockReturnValue(new Promise(() => undefined));

    const done = target.publish(events(1));
    await jest.advanceTimersByTimeAsync(600);

    await expect(done).resolves.toBeUndefined();
    jest.useRealTimers();
  });
});
