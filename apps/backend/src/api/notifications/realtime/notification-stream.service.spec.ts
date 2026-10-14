import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import type { AuthUser } from '@auth/types/auth.type';
import { ServiceUnavailableException } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Request } from 'express';
import type { Redis } from 'ioredis';
import type { Subscription } from 'rxjs';

import {
  NOTIFICATION_EVENTS_CHANNEL,
  NOTIFICATION_STREAM_HEARTBEAT_MS,
  NOTIFICATION_STREAM_SUBSCRIBE_GRACE_MS,
  NOTIFICATION_STREAMS_PER_REPLICA,
  NOTIFICATION_STREAMS_PER_USER,
} from './notification-stream.constants';
import { NotificationStreamService } from './notification-stream.service';

const ONE_HOUR = 60 * 60 * 1000;

describe('NotificationStreamService', () => {
  let target: NotificationStreamService;
  let onMessage: ((channel: string, raw: string) => void) | undefined;
  let subscribe: jest.Mock;
  let disconnect: jest.Mock;
  let subscriptions: Subscription[];

  beforeEach(() => {
    jest.useFakeTimers();
    subscriptions = [];
    subscribe = jest.fn().mockResolvedValue(1);
    disconnect = jest.fn();
    const subscriber = {
      on: jest.fn((event: string, handler: (channel: string, raw: string) => void) => {
        if (event === 'message') onMessage = handler;
      }),
      subscribe,
      disconnect,
    };
    target = new NotificationStreamService({ duplicate: () => subscriber } as unknown as Redis);
    target.onModuleInit();
  });

  afterEach(() => {
    subscriptions.forEach(subscription => {
      subscription.unsubscribe();
    });
    target.onModuleDestroy();
    jest.useRealTimers();
  });

  /** Opens a stream the way the controller does and collects what the browser would receive. */
  function connect(userId: string, lifetimeMs = ONE_HOUR) {
    const received: MessageEvent[] = [];
    const state = { completed: false };
    const subscription = target.open(userId, lifetimeMs).subscribe({
      next: event => received.push(event),
      complete: () => {
        state.completed = true;
      },
    });
    subscriptions.push(subscription);
    return { received, state, subscription };
  }

  const publish = (events: Array<{ userId: string; notificationId: string }>) =>
    onMessage?.(NOTIFICATION_EVENTS_CHANNEL, JSON.stringify({ events }));

  it('listens on the shared channel', () => {
    expect(subscribe).toHaveBeenCalledWith(NOTIFICATION_EVENTS_CHANNEL);
  });

  it('tells a new stream it is connected straight away', () => {
    const { received } = connect('user-1');

    expect(received).toEqual([{ type: 'ready', data: {} }]);
  });

  it('writes an event to the open stream of the user it is for, with the notification id', () => {
    const { received } = connect('user-1');

    publish([{ userId: 'user-1', notificationId: 'notice-9' }]);

    expect(received.at(-1)).toEqual({
      id: 'notice-9',
      type: 'notification',
      data: { id: 'notice-9' },
    });
  });

  it('ignores events for users who are not connected to this replica, and never leaks to another user', () => {
    const mine = connect('user-1');
    const theirs = connect('user-2');

    publish([{ userId: 'user-2', notificationId: 'notice-1' }]);
    publish([{ userId: 'nobody', notificationId: 'notice-2' }]);

    expect(mine.received).toHaveLength(1); // only `ready`
    expect(theirs.received.filter(event => event.type === 'notification')).toHaveLength(1);
  });

  it('writes to every open stream of the same user (several tabs)', () => {
    const a = connect('user-1');
    const b = connect('user-1');

    publish([{ userId: 'user-1', notificationId: 'notice-1' }]);

    expect(a.received.at(-1)?.type).toBe('notification');
    expect(b.received.at(-1)?.type).toBe('notification');
  });

  it('survives garbage on the channel', () => {
    const { received } = connect('user-1');

    onMessage?.(NOTIFICATION_EVENTS_CHANNEL, 'not json');
    onMessage?.(NOTIFICATION_EVENTS_CHANNEL, JSON.stringify({ events: 'nope' }));
    onMessage?.(
      NOTIFICATION_EVENTS_CHANNEL,
      JSON.stringify({ events: [{ userId: 'user-1', notificationId: 'ok' }] })
    );

    expect(received.at(-1)?.id).toBe('ok');
  });

  it('sends a heartbeat on the interval so proxies keep the connection open', () => {
    const { received } = connect('user-1');

    jest.advanceTimersByTime(NOTIFICATION_STREAM_HEARTBEAT_MS * 2);

    expect(received.filter(event => event.type === 'heartbeat')).toHaveLength(2);
  });

  it('ends the stream when its lifetime is up, and frees the slot', () => {
    const { state } = connect('user-1', 1_000);
    expect(target.openStreams).toBe(1);

    jest.advanceTimersByTime(1_000);

    expect(state.completed).toBe(true);
    expect(target.openStreams).toBe(0);
  });

  it('frees the slot when the client leaves, so nothing leaks', () => {
    const { subscription } = connect('user-1');

    subscription.unsubscribe();

    expect(target.openStreams).toBe(0);
  });

  it('closes the oldest stream when a user opens more than the cap, keeping the newest', () => {
    const streams = Array.from({ length: NOTIFICATION_STREAMS_PER_USER + 1 }, () =>
      connect('user-1')
    );

    expect(streams[0]?.state.completed).toBe(true);
    expect(streams.slice(1).every(stream => !stream.state.completed)).toBe(true);
    expect(target.openStreams).toBe(NOTIFICATION_STREAMS_PER_USER);
  });

  it('refuses a new stream with 503 once the replica is at its ceiling', () => {
    for (let i = 0; i < NOTIFICATION_STREAMS_PER_REPLICA; i += 1) {
      connect(`user-${i}`);
    }

    expect(() => target.open('one-more', ONE_HOUR)).toThrow(ServiceUnavailableException);
  });

  // Regression: with Redis down the subscribe command waits forever, and awaiting it in onModuleInit held up app.listen().
  it('does not wait for the subscription, so a Redis outage cannot hold up API startup', () => {
    subscribe.mockReturnValue(new Promise(() => undefined));
    const slow = new NotificationStreamService({
      duplicate: () => ({ on: jest.fn(), subscribe, disconnect }),
    } as unknown as Redis);

    expect(() => {
      slow.onModuleInit();
    }).not.toThrow();
  });

  it('logs and carries on when the subscription is rejected', async () => {
    subscribe.mockRejectedValue(new Error('NOAUTH'));
    const failing = new NotificationStreamService({
      duplicate: () => ({ on: jest.fn(), subscribe, disconnect }),
    } as unknown as Redis);

    expect(() => {
      failing.onModuleInit();
    }).not.toThrow();
    await Promise.resolve();
  });

  // A user at their own cap frees a slot by being evicted, so a full replica must not refuse them.
  it('lets a user who is at their own cap reconnect on a replica that is at its ceiling', () => {
    const others = NOTIFICATION_STREAMS_PER_REPLICA - NOTIFICATION_STREAMS_PER_USER;
    for (let i = 0; i < others; i += 1) connect(`other-${i}`);
    for (let i = 0; i < NOTIFICATION_STREAMS_PER_USER; i += 1) connect('user-1');
    expect(target.openStreams).toBe(NOTIFICATION_STREAMS_PER_REPLICA);

    expect(() => connect('user-1')).not.toThrow();
    expect(target.openStreams).toBe(NOTIFICATION_STREAMS_PER_REPLICA);
  });

  it('ends every stream and drops the subscriber on shutdown', () => {
    const { state } = connect('user-1');

    target.onModuleDestroy();

    expect(state.completed).toBe(true);
    expect(disconnect).toHaveBeenCalled();
  });

  it('gives the slot back when nothing ever subscribes to a stream it opened', () => {
    target.open('user-1', ONE_HOUR);
    expect(target.openStreams).toBe(1);

    jest.advanceTimersByTime(NOTIFICATION_STREAM_SUBSCRIBE_GRACE_MS);

    expect(target.openStreams).toBe(0);
  });

  it('keeps the slot of a stream that was subscribed in time', () => {
    connect('user-1');

    jest.advanceTimersByTime(NOTIFICATION_STREAM_SUBSCRIBE_GRACE_MS * 2);

    expect(target.openStreams).toBe(1);
  });

  it('ends a late subscription to a stream whose slot was already given back', () => {
    const stream = target.open('user-1', ONE_HOUR);
    jest.advanceTimersByTime(NOTIFICATION_STREAM_SUBSCRIBE_GRACE_MS);
    const received: MessageEvent[] = [];
    let completed = false;

    subscriptions.push(
      stream.subscribe({
        next: event => received.push(event),
        complete: () => {
          completed = true;
        },
      })
    );

    expect(completed).toBe(true);
    expect(received).toEqual([]);
    expect(target.openStreams).toBe(0);
  });

  describe('connect', () => {
    const tenantUser = { type: JwtTokenType.TENANT_USER, id: 'user-7' } as unknown as AuthUser;
    const requestWithToken = (expiresInMs: number): Request => {
      const exp = Math.floor((Date.now() + expiresInMs) / 1000);
      const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
      return {
        headers: { authorization: `Bearer header.${payload}.signature` },
        cookies: {},
      } as unknown as Request;
    };

    it('opens a stream for the tenant user that lives until the access token expires', () => {
      const received: MessageEvent[] = [];
      const state = { completed: false };
      subscriptions.push(
        target.connect(tenantUser, requestWithToken(60_000)).subscribe({
          next: event => received.push(event),
          complete: () => {
            state.completed = true;
          },
        })
      );

      publish([{ userId: 'user-7', notificationId: 'n1' }]);
      expect(received.at(-1)).toMatchObject({ type: 'notification' });
      expect(state.completed).toBe(false);

      jest.advanceTimersByTime(60_000);
      expect(state.completed).toBe(true);
    });

    it('refuses a platform admin, who has no feed', () => {
      const admin = { type: JwtTokenType.PLATFORM_ADMIN, id: 'admin-1' } as unknown as AuthUser;

      expect(() => target.connect(admin, requestWithToken(60_000))).toThrow();
      expect(target.openStreams).toBe(0);
    });
  });
});
