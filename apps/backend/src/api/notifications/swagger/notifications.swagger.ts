import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';

import {
  NotificationListResponseDto,
  NotificationReadResponseDto,
} from '../dto/notification-response.dto';

export function ApiListNotifications(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'List the caller’s notifications',
      description:
        'The bell popover’s feed — the current user’s own in-app notifications, newest first. ' +
        'Scoped to the caller’s tenant *and* user id from the token; there is no way to read ' +
        'another user’s feed. `offset`/`limit`, not this app’s usual `page`/`pageSize` — matches ' +
        'the shipped frontend’s own `list(offset, limit)` call exactly. `unreadTotal` covers the ' +
        'whole feed, not just this page, so there is no separate unread-count route.',
    }),
    ApiQuery({ name: 'offset', required: false, type: Number, example: 0 }),
    ApiQuery({ name: 'limit', required: false, type: Number, example: 20 }),
    ApiResponse({
      status: HttpStatus.OK,
      type: NotificationListResponseDto,
      examples: {
        default: {
          summary: 'Typical response',
          value: {
            items: [
              {
                id: '0190f3b2-8c41-7a2e-9f5d-11c0de44aa01',
                type: 'review_escalated',
                title: 'Review escalated',
                description:
                  'A 1-star review from Jordan P. was flagged for low rating and needs your attention.',
                reviewId: '0190f3aa-1f02-7bb1-8e30-91ab77cc2201',
                isRead: false,
                createdAt: '2026-09-19T09:15:00.000Z',
              },
            ],
            hasMore: false,
            unreadTotal: 1,
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' })
  );
}

export function ApiMarkNotificationRead(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Mark one notification read',
      description:
        'Stamps a single notification in the caller’s own feed as read. Scoped to the caller’s ' +
        'tenant *and* user id, so another user’s notification id answers 404 rather than being ' +
        'written. Idempotent: marking an already-read notification succeeds and leaves the ' +
        'original timestamp untouched, which is what lets the bell fire this on every click.',
    }),
    ApiParam({
      name: 'notificationId',
      format: 'uuid',
      example: '0190f3b2-8c41-7a2e-9f5d-11c0de44aa01',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: NotificationReadResponseDto,
      examples: {
        default: { summary: 'Typical response', value: { unreadTotal: 4 } },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'No such notification in the caller’s feed',
    })
  );
}

export function ApiMarkAllNotificationsRead(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Mark the caller’s whole feed read',
      description:
        'Stamps every unread notification in the caller’s own feed as read, never anyone ' +
        'else’s. Already-read rows keep their original timestamps. `unreadTotal` is read back ' +
        'from the database rather than assumed to be zero, so a notification that arrived ' +
        'mid-request is still counted.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: NotificationReadResponseDto,
      examples: {
        default: { summary: 'Typical response', value: { unreadTotal: 0 } },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' })
  );
}

export function ApiNotificationStream(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Stream "something new" events (server-sent events)',
      description:
        'One long response (`text/event-stream`) that stays open and receives an event whenever a notification is created for the ' +
        'caller: `event: notification` with `{ id }` (the notification id), plus `ready` on connect and `heartbeat` every 25 seconds. ' +
        'Events carry ids only; fetch the notice with `GET /v1/notifications`. Authenticated by the session cookie (a browser ' +
        '`EventSource` cannot set headers). The stream ends when the access token expires (at most 30 minutes) and the client ' +
        'reconnects; at most 3 streams per user (the oldest is closed). Not part of the generated client.',
    }),
    ApiResponse({ status: HttpStatus.OK, description: 'An open `text/event-stream` response' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description: 'This replica is at its stream limit; the client falls back to polling',
    })
  );
}
