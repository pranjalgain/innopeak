import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AdminBusinessResponseDto } from '../dto/admin-business-response.dto';
import { AdminOverviewStatsResponseDto } from '../dto/admin-overview-stats-response.dto';
import { AdminSignupTrendPointResponseDto } from '../dto/admin-signup-trend-point-response.dto';
import { PlatformActivityResponseDto } from '../dto/platform-activity-response.dto';

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
      summary: 'Most recent platform-admin actions',
      description:
        'A purpose-built log (`platform_activity_log`) of business suspend/reactivate and admin ' +
        'invite send/revoke, newest first, with the real actor who performed each one.',
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
          ],
        },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: '`limit` outside 1-50' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}
