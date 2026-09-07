import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { ReviewDetailResponseDto, ReviewListResponseDto } from '../dto/review-response.dto';

export function ApiListReviews(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'The review queue listing',
      description:
        "One page of the caller's tenant's reviews, newest-reviewed first, each carrying a " +
        'compact summary of its live response so the client can render the computed status badge ' +
        'without a second request per row. Filtering is server-side: `status` and ' +
        '`classification` map onto indexed columns, `search` is a case-insensitive match on ' +
        'reviewer_name only (matching the frontend). Note the frontend\'s "unclassified" is not a ' +
        'valid classification value — no column backs it.',
    }),
    ApiQuery({
      name: 'status',
      required: false,
      enum: ReviewStatus,
    }),
    ApiQuery({
      name: 'classification',
      required: false,
      enum: ReviewClassification,
    }),
    ApiQuery({ name: 'locationId', required: false }),
    ApiQuery({ name: 'search', required: false }),
    ApiQuery({ name: 'page', required: false, example: 1 }),
    ApiQuery({ name: 'pageSize', required: false, example: 20 }),
    ApiResponse({ status: 200, type: ReviewListResponseDto }),
    ApiResponse({ status: 401, description: 'Missing or expired access token' })
  );
}

export function ApiGetReview(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiParam({ name: 'reviewId', example: '0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22' }),
    ApiOperation({
      summary: 'One review with every response attached',
      description:
        'Terminal responses are returned deliberately — the UI renders rejected and superseded ' +
        'rows greyed out with their outcome, which is the entire reason `superseded` is a state ' +
        'rather than a deletion. `status` is a projection onto the four values the client ' +
        'understands (draft→pending_approval, posted/post_failed→approved), because the shipped ' +
        'card treats that union as exhaustive and a raw seven-value enum yields an unstyled badge ' +
        'and a missing translation key. `label` ("A", "B") is derived from position within ' +
        'generationGroupId, not stored. `generationMetadata` is deliberately never returned — it ' +
        'holds model/region/token counts for server-side debugging.',
    }),
    ApiResponse({ status: 200, type: ReviewDetailResponseDto }),
    ApiResponse({ status: 404, description: "REVIEW_NOT_FOUND (unknown id, or another tenant's)" })
  );
}
