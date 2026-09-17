import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { PlatformActivityResponseDto } from '../dto/platform-activity-response.dto';
import { PlatformReviewStatsResponseDto } from '../dto/platform-review-stats-response.dto';

export function ApiGetPlatformReviewStats(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Platform-wide review throughput',
      description:
        'Total reviews synced and total replies posted, aggregated across every tenant — not ' +
        "windowed, unlike the tenant dashboard's own metrics.",
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: PlatformReviewStatsResponseDto,
      examples: {
        default: {
          summary: 'Platform review throughput',
          value: { totalReviewsFetched: 4821, totalRepliesSent: 3660 },
        },
      },
    }),
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
