import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { AdminBusinessResponseDto } from '../dto/admin-business-response.dto';
import { AdminOverviewStatsResponseDto } from '../dto/admin-overview-stats-response.dto';
import { AdminSignupTrendPointResponseDto } from '../dto/admin-signup-trend-point-response.dto';
import {
  PlatformActivityListResponseDto,
  PlatformActivityResponseDto,
} from '../dto/platform-activity-response.dto';

export function ApiGetOverviewStats(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Overview stat cards',
      description:
        'Total businesses, total users, total reviews synced and total replies posted — the four ' +
        "figures behind the Overview page's stat cards, aggregated across every tenant.",
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: AdminOverviewStatsResponseDto,
      examples: {
        default: {
          summary: 'Platform-wide stat cards',
          value: {
            businessCount: 128,
            userCount: 412,
            totalReviewsFetched: 4821,
            totalRepliesSent: 3660,
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiGetRecentBusinesses(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Most recently created businesses',
      description:
        'The newest tenants, newest first, capped at `limit` — the Overview page\'s "Recent ' +
        'Businesses" card. Same shape as `GET /v1/admin/businesses`, just a smaller page of it.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: [AdminBusinessResponseDto],
      examples: {
        default: {
          summary: 'Recently created businesses',
          value: [
            {
              id: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
              name: 'The Coastal Table',
              status: 'active',
              connectionStatus: 'connected',
              ownerName: 'Maria Delgado',
              ownerEmail: 'maria@coastaltable.com',
              userCount: 4,
              createdAt: '2026-09-11T09:00:00.000Z',
            },
          ],
        },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: '`limit` outside 1-50' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiGetNeedsAttention(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Businesses needing attention',
      description:
        'Non-connected tenants (disconnected, needs re-auth, or never onboarded), most urgent ' +
        'first, capped at `limit` — a broken connection on a live customer outranks a tenant that ' +
        'never finished onboarding.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: [AdminBusinessResponseDto],
      examples: {
        default: {
          summary: 'Businesses needing attention',
          value: [
            {
              id: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
              name: 'Oak & Iron Hardware',
              status: 'active',
              connectionStatus: 'disconnected',
              ownerName: 'Priya Shah',
              ownerEmail: 'priya@oakandiron.com',
              userCount: 2,
              createdAt: '2026-08-02T09:00:00.000Z',
            },
          ],
        },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: '`limit` outside 1-50' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiGetSignupTrend(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Tenant signups by month',
      description:
        'Tenant signup counts bucketed by calendar month (UTC) over the trailing `months` months, ' +
        'oldest first. Every month in the window is present, including zero-signup ones.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: [AdminSignupTrendPointResponseDto],
      examples: {
        default: {
          summary: 'Six-month signup trend',
          value: [
            { monthKey: '2026-04', count: 3 },
            { monthKey: '2026-05', count: 0 },
            { monthKey: '2026-06', count: 5 },
            { monthKey: '2026-07', count: 2 },
            { monthKey: '2026-08', count: 8 },
            { monthKey: '2026-09', count: 4 },
          ],
        },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: '`months` outside 1-24' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiGetRecentActivity(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Recent platform activity — the Overview page’s glance feed',
      description:
        'The newest entries of the platform activity log (`platform_activity_log`): business suspend/reactivate, ' +
        'erasure requested/cancelled/erased (by an admin, by the owner, or by the nightly purge), a new business ' +
        'joining, admin invite send/revoke, admin/user enable-disable and platform settings changes. ' +
        "The Overview page's glance feed; `ApiListPlatformActivity` is the paginated, filterable view of the same rows.",
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: [PlatformActivityResponseDto],
      examples: {
        default: {
          summary: 'Recent platform activity',
          value: [
            {
              id: '0190f3b4-1a88-70c5-8d19-6b2e4f7a9c33',
              type: 'business_suspended',
              actorEmail: 'admin@innopeak.com',
              businessName: 'Oak & Iron Hardware',
              email: null,
              occurredAt: '2026-09-11T09:12:00.000Z',
            },
            {
              id: '0190f3c1-2a88-70c5-8d19-6b2e4f7a9c33',
              type: 'business_joined',
              actorEmail: 'maria@coastaltable.com',
              businessName: 'The Coastal Table',
              email: null,
              details: null,
              occurredAt: '2026-09-10T14:03:00.000Z',
            },
            {
              id: '0190f3c2-3b99-70c5-8d19-6b2e4f7a9c44',
              type: 'platform_settings_changed',
              actorEmail: 'admin@innopeak.com',
              businessName: null,
              email: null,
              details: { changes: [{ field: 'googleLoginEnabled', from: true, to: false }] },
              occurredAt: '2026-09-09T11:30:00.000Z',
            },
          ],
        },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: '`limit` outside 1-50' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiListPlatformActivity(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Paginated, filterable platform-admin action history',
      description:
        'The same `platform_activity_log` rows `ApiGetRecentActivity` reads, but paginated and ' +
        'filterable by type rather than a bounded top-N read — backs a dedicated Activity view ' +
        "rather than the Overview page's small glance card.",
    }),
    ApiQuery({ name: 'page', required: false, example: 1 }),
    ApiQuery({ name: 'pageSize', required: false, example: 20 }),
    ApiQuery({ name: 'type', required: false, enum: PlatformActivityType }),
    ApiResponse({
      status: HttpStatus.OK,
      type: PlatformActivityListResponseDto,
      examples: {
        default: {
          summary: 'One page of platform activity',
          value: {
            activities: [
              {
                id: '0190f3b4-1a88-70c5-8d19-6b2e4f7a9c33',
                type: 'business_suspended',
                actorEmail: 'admin@innopeak.com',
                businessName: 'Oak & Iron Hardware',
                email: null,
                occurredAt: '2026-09-11T09:12:00.000Z',
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}
