import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { MetricsDto } from '../dto/metrics.dto';
import { RatingDistributionDto } from '../dto/rating-distribution.dto';
import { RecentEscalatedDto } from '../dto/recent-escalated.dto';

const TENANT_SCOPE_NOTE =
  "Scoped to the caller's own tenant, taken from the access token. There is deliberately no " +
  "tenant parameter — one would let any authenticated user read another business's data.";

export function ApiDashboardMetrics(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Aggregated metrics for the dashboard stat cards',
      description:
        `${TENANT_SCOPE_NOTE} \`total\` and \`avgRating\` cover the trailing \`days\` window, ` +
        'measured on `reviewed_at` (when the review was left) rather than `created_at` (when the ' +
        'sync imported it). `pending` and `escalated` are open-backlog counts and are ' +
        'intentionally not windowed — see the response schema for why.',
    }),
    ApiResponse({ status: 200, type: MetricsDto }),
    ApiResponse({ status: 400, description: '`days` outside 1-365' }),
    ApiResponse({ status: 401, description: 'Missing or expired access token' })
  );
}

export function ApiDashboardRatingDistribution(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Review counts per star rating for a time window',
      description: `${TENANT_SCOPE_NOTE} Buckets 1-5 are always present, zero-filled.`,
    }),
    ApiResponse({ status: 200, type: RatingDistributionDto }),
    ApiResponse({ status: 400, description: '`days` outside 1-365' }),
    ApiResponse({ status: 401, description: 'Missing or expired access token' })
  );
}

export function ApiDashboardRecentEscalated(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Most recent escalated reviews still awaiting action',
      description:
        `${TENANT_SCOPE_NOTE} Newest \`reviewed_at\` first, restricted to reviews still open ` +
        '(status `new` or `in_review`) so a resolved escalation drops off the list. Carries the ' +
        'stored `escalationReason` — the client must not infer it from the star rating, since a ' +
        '5-star blocklist match is routine.',
    }),
    ApiResponse({ status: 200, type: [RecentEscalatedDto] }),
    ApiResponse({ status: 400, description: '`limit` outside 1-50' }),
    ApiResponse({ status: 401, description: 'Missing or expired access token' })
  );
}
