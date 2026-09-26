import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AdminStatisticsSummaryResponseDto } from '../dto/admin-statistics-summary-response.dto';

export function ApiGetStatisticsSummary(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Platform-wide review/sync statistics',
      description:
        "Deeper than the Overview page's four headline stat cards: reply rate, average rating, " +
        'sync success rate, connection health, plus review-volume trend, rating distribution and ' +
        'classification breakdown — every figure aggregated across every tenant.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: AdminStatisticsSummaryResponseDto,
      examples: {
        default: {
          summary: 'Six-month statistics summary',
          value: {
            replyRatePercent: 75.9,
            avgRating: 4.2,
            syncSuccessRatePercent: 96.4,
            connectionHealth: {
              connected: 108,
              needsReauth: 6,
              disconnected: 4,
              neverConnected: 10,
            },
            reviewsTrend: [
              { monthKey: '2026-04', reviewsFetched: 620, repliesSent: 480 },
              { monthKey: '2026-05', reviewsFetched: 710, repliesSent: 540 },
              { monthKey: '2026-06', reviewsFetched: 690, repliesSent: 520 },
              { monthKey: '2026-07', reviewsFetched: 780, repliesSent: 610 },
              { monthKey: '2026-08', reviewsFetched: 830, repliesSent: 650 },
              { monthKey: '2026-09', reviewsFetched: 812, repliesSent: 640 },
            ],
            ratingDistribution: [
              { rating: 1, count: 92 },
              { rating: 2, count: 140 },
              { rating: 3, count: 310 },
              { rating: 4, count: 980 },
              { rating: 5, count: 2140 },
            ],
            classificationBreakdown: [
              { classification: 'auto_reply_candidate', count: 3980 },
              { classification: 'escalated', count: 610 },
              { classification: 'pending_classification', count: 72 },
            ],
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: '`months` outside 1-24' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}
