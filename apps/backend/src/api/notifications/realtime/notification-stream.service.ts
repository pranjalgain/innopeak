import { SessionRevocationService } from '@auth/services/session-revocation.service';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import {
  Inject,
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import type { Request } from 'express';
import { Redis } from 'ioredis';
import { interval, map, merge, Observable, of, Subject, takeUntil } from 'rxjs';

import type { NotificationStreamMessage } from './notification-event.type';
import {
  NOTIFICATION_EVENTS_CHANNEL,
  NOTIFICATION_STREAM_HEARTBEAT_MS,
  NOTIFICATION_STREAM_MAX_LIFETIME_MS,
  NOTIFICATION_STREAM_SUBSCRIBE_GRACE_MS,
  NOTIFICATION_STREAMS_PER_REPLICA,
  NOTIFICATION_STREAMS_PER_USER,
} from './notification-stream.constants';

import type { AuthUser } from '../../auth/types/auth.type';
import { accessTokenIssuedAt, msUntilAccessTokenExpiry } from '../utils/token-expiry.util';

/** What the stream needs to notice its session ending: the same marks the guard checks on every request. */
interface StreamSession {
  tenantId: string;
  /** The access token's `iat`; a token without one is refused by any mark. */
  issuedAt: number | undefined;
}

interface OpenStream {
  events: Subject<MessageEvent>;
  /** Emits once to end the stream from our side (evicted, or the replica is shutting down). */
  closed: Subject<void>;
  /** Set when the slot was given back because nobody ever subscribed; a subscription that arrives after that just ends. */
  abandoned: boolean;
}

/**
 * The receiving half of the real-time feed, API only. Holds one Redis subscriber and the open server-sent-event responses of the users
 * connected to this replica; a message from Redis is written to that user's open streams and ignored if the user is connected to another
 * replica. The browser opened each stream (an ordinary GET); this only ever writes to connections that already exist.
 */
@Injectable()
export class NotificationStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationStreamService.name);
  private subscriber: Redis | null = null;
  private readonly streams = new Map<string, Set<OpenStream>>();
  private openCount = 0;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly sessionRevocationService: SessionRevocationService
  ) {}

  onModuleInit(): void {
    // A dedicated connection: a client in subscriber mode cannot run other commands.
    const subscriber = this.redis.duplicate();
    this.subscriber = subscriber;
    subscriber.on('message', (_channel: string, raw: string) => {
      this.handleMessage(raw);
    });
    subscriber.on('error', (error: Error) => {
      this.logger.warn(`Notification subscriber error: ${error.message}`);
    });
    // Not awaited: the shared Redis options make a command wait forever for a connection that is down, so awaiting here would hold up
    // `app.listen()` until Redis returns. ioredis subscribes once it connects (and again after any reconnect); until then streams just
    // stay quiet and polling covers it.
    subscriber.subscribe(NOTIFICATION_EVENTS_CHANNEL).catch((error: unknown) => {
      this.logger.warn(
        `Could not subscribe to ${NOTIFICATION_EVENTS_CHANNEL}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
  }

  onModuleDestroy(): void {
    for (const set of this.streams.values()) {
      for (const stream of set) {
        stream.closed.next();
      }
    }
    this.streams.clear();
    this.openCount = 0;
    this.subscriber?.disconnect();
    this.subscriber = null;
  }

  /**
   * The entry point for a request: tenant users only (the feed is a tenant concept), living until the caller's access token expires.
   * Kept here, not in the controller, because how long a stream may live is this service's policy.
   */
  connect(user: AuthUser, req: Request): Observable<MessageEvent> {
    const tenantUser = requireTenantUser(user);
    return this.open(
      tenantUser.id,
      msUntilAccessTokenExpiry(req, NOTIFICATION_STREAM_MAX_LIFETIME_MS),
      { tenantId: tenantUser.tenantId, issuedAt: accessTokenIssuedAt(req) }
    );
  }

  /**
   * Opens a stream for `userId`. Ends after `maxLifetimeMs` (never longer than the hard cap) or when the client leaves. Over the per-user
   * cap the oldest stream is closed; over the replica cap this refuses with 503 so the client falls back to polling.
   * With a `session`, the stream also ends at the first heartbeat after that session is revoked (logout, password change, a disabled
   * user, a suspended business): the guard only checks the token when the stream opens, and an open stream would otherwise keep
   * telling a signed-out browser that something new arrived until the token expired.
   */
  open(userId: string, maxLifetimeMs: number, session?: StreamSession): Observable<MessageEvent> {
    const userStreams = this.streams.get(userId) ?? new Set<OpenStream>();
    // A user at their own cap frees one slot by being evicted below, so that must count before refusing: otherwise a replica at its
    // ceiling answers 503 to a reconnecting user whose old stream is about to close (and a 503 ends an EventSource for good).
    const slotsFreedByEviction = userStreams.size >= NOTIFICATION_STREAMS_PER_USER ? 1 : 0;
    if (this.openCount - slotsFreedByEviction >= NOTIFICATION_STREAMS_PER_REPLICA) {
      throw new ServiceUnavailableException();
    }

    while (userStreams.size >= NOTIFICATION_STREAMS_PER_USER) {
      const oldest = userStreams.values().next().value as OpenStream;
      // Removed first: closing runs the stream's teardown synchronously, which must find nothing left to release.
      userStreams.delete(oldest);
      this.openCount -= 1;
      oldest.closed.next();
    }

    const stream: OpenStream = {
      events: new Subject<MessageEvent>(),
      closed: new Subject<void>(),
      abandoned: false,
    };
    userStreams.add(stream);
    this.streams.set(userId, userStreams);
    this.openCount += 1;

    // The slot is taken now (the caps must be exact) but only given back by the teardown of a subscription. If the request dies between
    // here and Nest subscribing (an aborted connection, a filter that throws), nothing would ever free it, so it expires unclaimed.
    const unclaimed = setTimeout(() => {
      stream.abandoned = true;
      this.release(userId, stream);
    }, NOTIFICATION_STREAM_SUBSCRIBE_GRACE_MS);

    const lifetimeMs = Math.min(maxLifetimeMs, NOTIFICATION_STREAM_MAX_LIFETIME_MS);

    return new Observable<MessageEvent>(subscriber => {
      clearTimeout(unclaimed);
      if (stream.abandoned) {
        subscriber.complete();
        return undefined;
      }
      const subscription = merge(
        // Tells the client it is connected right away, so it can slow its polling.
        of<MessageEvent>({ type: 'ready', data: {} }),
        stream.events,
        interval(NOTIFICATION_STREAM_HEARTBEAT_MS).pipe(
          map((): MessageEvent => ({ type: 'heartbeat', data: {} }))
        )
      )
        .pipe(takeUntil(stream.closed))
        .subscribe(subscriber);
      const lifetime = setTimeout(() => {
        subscriber.complete();
      }, lifetimeMs);
      const revocationCheck =
        session === undefined
          ? undefined
          : setInterval(() => {
              // Fails open (and never rejects) when Redis is down, like the guard: the stream then runs to its normal end.
              void this.sessionRevocationService
                .isRevoked({ userId, tenantId: session.tenantId, issuedAt: session.issuedAt })
                .then(revoked => {
                  if (revoked) {
                    subscriber.complete();
                  }
                });
            }, NOTIFICATION_STREAM_HEARTBEAT_MS);

      return () => {
        clearTimeout(lifetime);
        clearInterval(revocationCheck);
        subscription.unsubscribe();
        this.release(userId, stream);
      };
    });
  }

  /** Exposed for the health of the replica (and tests). */
  get openStreams(): number {
    return this.openCount;
  }

  private release(userId: string, stream: OpenStream): void {
    const userStreams = this.streams.get(userId);
    if (userStreams?.delete(stream)) {
      this.openCount -= 1;
      if (userStreams.size === 0) {
        this.streams.delete(userId);
      }
    }
  }

  private handleMessage(raw: string): void {
    let message: NotificationStreamMessage;
    try {
      message = JSON.parse(raw) as NotificationStreamMessage;
    } catch {
      return;
    }
    if (!Array.isArray(message.events)) {
      return;
    }

    for (const event of message.events) {
      const userStreams = this.streams.get(event.userId);
      if (userStreams === undefined) {
        continue;
      }
      for (const stream of userStreams) {
        stream.events.next({
          id: event.notificationId,
          type: 'notification',
          data: { id: event.notificationId },
        });
      }
    }
  }
}
