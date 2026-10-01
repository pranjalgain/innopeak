import { ResponseSource } from '@common/enums/response-source.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewSentiment } from '@common/enums/review-sentiment.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';

import {
  ReviewDetailResponseDto,
  ReviewListResponseDto,
  ReviewResponseItemDto,
} from '../dto/review-response.dto';
import { ClientResponseStatus } from '../enums/client-response-status.enum';

const REVIEW_RESPONSE_ITEM_EXAMPLE = {
  id: '0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64',
  generationGroupId: null,
  label: 'A',
  responseType: ResponseType.AUTO_REPLY_SUGGESTION,
  content: 'Thank you so much, Marta — we hope to see you again soon!',
  originalContent: 'Thank you for your feedback, Marta.',
  source: ResponseSource.HUMAN_EDITED,
  status: ClientResponseStatus.APPROVED,
  createdByUserId: null,
  approvedByUserId: '0190f3b2-4d90-7a55-b7e2-9f1c3a6d8e21',
  rejectedByUserId: null,
  createdAt: '2026-03-12T09:01:11.402Z',
  decidedAt: '2026-03-12T09:05:44.201Z',
  postedAt: null,
  errorMessage: null,
};

const REVIEW_LIST_ITEM_EXAMPLE = {
  id: '0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22',
  locationId: '0190f3a9-1d22-7b4c-8e11-9c2f4a7b6d03',
  reviewerName: 'Marta Kowalska',
  rating: 5,
  reviewText: 'Best cioppino on the harbour.',
  reviewedAt: '2026-03-11T18:22:04.129Z',
  sentiment: ReviewSentiment.POSITIVE,
  classification: ReviewClassification.PENDING_CLASSIFICATION,
  escalationReason: null,
  matchedKeywords: null,
  status: ReviewStatus.RESPONDED,
  anonymizedAt: null,
  removedUpstreamAt: null,
  responseCount: 1,
  latestResponse: {
    id: '0190f3b2-8a03-7c55-b2d7-6e1f0a9c4b58',
    status: ClientResponseStatus.APPROVED,
    responseType: ResponseType.IMPORTED_REPLY,
    source: ResponseSource.IMPORTED,
    createdAt: '2026-03-12T09:01:11.402Z',
  },
};

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
      example: ReviewStatus.IN_REVIEW,
    }),
    ApiQuery({
      name: 'classification',
      required: false,
      enum: ReviewClassification,
      example: ReviewClassification.ESCALATED,
    }),
    ApiQuery({
      name: 'locationId',
      required: false,
      example: '0190f3a9-1d22-7b4c-8e11-9c2f4a7b6d03',
    }),
    ApiQuery({ name: 'search', required: false, example: 'Nadia' }),
    ApiQuery({ name: 'page', required: false, example: 1 }),
    ApiQuery({ name: 'pageSize', required: false, example: 20 }),
    ApiResponse({
      status: 200,
      type: ReviewListResponseDto,
      examples: {
        default: {
          summary: 'One page of the review queue',
          value: {
            data: [REVIEW_LIST_ITEM_EXAMPLE],
            meta: { page: 1, pageSize: 20, total: 42, totalPages: 3 },
          },
        },
      },
    }),
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
    ApiResponse({
      status: 200,
      type: ReviewDetailResponseDto,
      examples: {
        default: {
          summary: 'A review with its response history',
          value: {
            ...REVIEW_LIST_ITEM_EXAMPLE,
            externalReviewId: 'ptl-001',
            externalUpdatedAt: '2026-03-11T18:22:04.129Z',
            responses: [
              {
                id: '0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64',
                generationGroupId: null,
                label: 'A',
                responseType: ResponseType.IMPORTED_REPLY,
                content: 'Thank you Marta — see you next weekend!',
                originalContent: null,
                source: ResponseSource.IMPORTED,
                status: ClientResponseStatus.APPROVED,
                createdByUserId: null,
                approvedByUserId: null,
                rejectedByUserId: null,
                createdAt: '2026-03-12T09:01:11.402Z',
                decidedAt: null,
                postedAt: '2026-03-12T09:01:11.402Z',
                errorMessage: null,
              },
            ],
          },
        },
      },
    }),
    ApiResponse({ status: 404, description: "REVIEW_NOT_FOUND (unknown id, or another tenant's)" })
  );
}

export function ApiApproveReply(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiParam({ name: 'reviewId', example: '0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22' }),
    ApiParam({ name: 'responseId', example: '0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64' }),
    ApiOperation({
      summary: 'Approve a pending reply draft',
      description:
        'Persists the decision — records who approved it and when. Omit `content` to approve the ' +
        'draft as-is; pass edited text and the response is recorded as `human_edited` instead of ' +
        'its original source. Supersedes every other still-pending sibling on the same review, ' +
        'since only one reply can ever be live per review. Lands the response at ' +
        '`status: approved`, never `posted` — actually publishing to Google Business Profile is a ' +
        'separate, not-yet-built step.',
    }),
    ApiResponse({
      status: 200,
      type: ReviewResponseItemDto,
      examples: {
        default: { summary: 'The approved response', value: REVIEW_RESPONSE_ITEM_EXAMPLE },
      },
    }),
    ApiResponse({ status: 404, description: 'REVIEW_RESPONSE_NOT_FOUND' }),
    ApiResponse({
      status: 409,
      description:
        'REVIEW_RESPONSE_NOT_ACTIONABLE (already decided) or REVIEW_RESPONSE_ALREADY_LIVE ' +
        '(a sibling won the same race first)',
    })
  );
}

export function ApiRejectReply(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiParam({ name: 'reviewId', example: '0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22' }),
    ApiParam({ name: 'responseId', example: '0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64' }),
    ApiOperation({
      summary: 'Reject a pending reply draft',
      description:
        'Persists the decision — records who rejected it and when (`rejectedByUserId`/`decidedAt`), ' +
        'no free-text reason. The row is kept, not deleted: a rejected sibling is shown greyed out ' +
        'with its outcome, the same reasoning `superseded` rows already follow.',
    }),
    ApiResponse({
      status: 200,
      type: ReviewResponseItemDto,
      examples: {
        default: {
          summary: 'The rejected response',
          value: {
            ...REVIEW_RESPONSE_ITEM_EXAMPLE,
            source: ResponseSource.AI_GENERATED,
            status: ClientResponseStatus.REJECTED,
            approvedByUserId: null,
            rejectedByUserId: '0190f3b2-4d90-7a55-b7e2-9f1c3a6d8e21',
            postedAt: null,
          },
        },
      },
    }),
    ApiResponse({ status: 404, description: 'REVIEW_RESPONSE_NOT_FOUND' }),
    ApiResponse({ status: 409, description: 'REVIEW_RESPONSE_NOT_ACTIONABLE (already decided)' })
  );
}
