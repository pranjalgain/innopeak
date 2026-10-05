import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { TenantAuthUser } from '@auth/types/auth.type';
import { MESSAGES } from '@common/constants/messages.constants';
import { ResponseSource } from '@common/enums/response-source.enum';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type {
  ReviewResponseRow,
  ReviewRow,
} from '@db/repositories/review-sync/types/review-sync.type';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ReviewPostQueue } from '@review-post-queue/review-post.queue';

import {
  PostQueueUnavailableException,
  ResponseNotPostableException,
  ResponseNotRetryableException,
  ReviewAlreadyDismissedException,
  ReviewAlreadyHasLiveReplyException,
  ReviewRemovedUpstreamException,
  ReviewResponseAlreadyLiveException,
  ReviewResponseNotApprovableException,
} from './exceptions/reviews.exceptions';
import { ReviewsService } from './reviews.service';

const user: TenantAuthUser = {
  type: JwtTokenType.TENANT_USER,
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'owner@example.com',
  role: UserRole.OWNER,
  locale: null,
};

const review: ReviewRow = {
  id: 'review-1',
  locationId: 'location-1',
  externalReviewId: 'ext-1',
  reviewerName: 'Marta Kowalska',
  rating: 5,
  reviewText: 'Best cioppino on the harbour.',
  reviewedAt: '2026-03-11T18:22:04.129Z',
  externalUpdatedAt: '2026-03-11T18:22:04.129Z',
  sentiment: null,
  classification: ReviewClassification.PENDING_CLASSIFICATION,
  escalationReason: null,
  matchedKeywords: null,
  status: ReviewStatus.NEW,
  anonymizedAt: null,
  removedUpstreamAt: null,
};

const pendingResponse: ReviewResponseRow = {
  id: 'response-1',
  reviewId: 'review-1',
  generationGroupId: null,
  responseType: ResponseType.AUTO_REPLY_SUGGESTION,
  content: 'Thank you for your feedback, Marta.',
  originalContent: 'Thank you for your feedback, Marta.',
  source: ResponseSource.AI_GENERATED,
  status: ResponseStatus.PENDING_APPROVAL,
  createdByUserId: null,
  approvedByUserId: null,
  rejectedByUserId: null,
  createdAt: '2026-03-12T09:01:11.402Z',
  decidedAt: null,
  postedAt: null,
  errorMessage: null,
};

describe('ReviewsService', () => {
  let service: ReviewsService;
  const listReviews = jest.fn();
  const findReviewForTenant = jest.fn();
  const findResponsesForReviews = jest.fn();
  const findResponseForTenant = jest.fn();
  const approveResponse = jest.fn();
  const rejectResponse = jest.fn();
  const retryPostableResponse = jest.fn();
  const insertManualReply = jest.fn();
  const findAutoPostEnabled = jest.fn();
  const addPostJob = jest.fn();
  const markResponsePostFailed = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    findResponsesForReviews.mockResolvedValue([]);
    findAutoPostEnabled.mockResolvedValue(false);
    addPostJob.mockResolvedValue(undefined);
    markResponsePostFailed.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: ReviewSyncDbService,
          useValue: {
            listReviews,
            findReviewForTenant,
            findResponsesForReviews,
            findResponseForTenant,
            approveResponse,
            rejectResponse,
            retryPostableResponse,
            insertManualReply,
            markResponsePostFailed,
          },
        },
        {
          provide: SettingsDbService,
          useValue: { findAutoPostEnabled },
        },
        {
          provide: ReviewPostQueue,
          useValue: { addPostJob },
        },
      ],
    }).compile();

    service = moduleRef.get(ReviewsService);
  });

  describe('listReviews', () => {
    it('groups the tenant-scoped response lookup into a single named input rather than positional args', async () => {
      listReviews.mockResolvedValue({ reviews: [review], total: 1 });

      await service.listReviews({ user, page: 1, pageSize: 20 });

      expect(findResponsesForReviews).toHaveBeenCalledWith({
        reviewIds: ['review-1'],
        tenantId: 'tenant-1',
      });
    });

    it('attaches the latest live response and response count per review', async () => {
      listReviews.mockResolvedValue({ reviews: [review], total: 1 });
      findResponsesForReviews.mockResolvedValue([
        {
          id: 'response-1',
          reviewId: 'review-1',
          generationGroupId: null,
          responseType: ResponseType.IMPORTED_REPLY,
          content: 'Thanks!',
          originalContent: null,
          source: ResponseSource.IMPORTED,
          status: ResponseStatus.POSTED,
          createdByUserId: null,
          approvedByUserId: null,
          createdAt: '2026-03-12T09:01:11.402Z',
          decidedAt: null,
          postedAt: '2026-03-12T09:01:11.402Z',
          errorMessage: null,
        },
      ]);

      const result = await service.listReviews({ user, page: 1, pageSize: 20 });

      expect(result.data[0]?.responseCount).toBe(1);
      expect(result.data[0]?.latestResponse?.id).toBe('response-1');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });
  });

  describe('getReview', () => {
    it('groups the review + tenant lookup into a single named input rather than positional args', async () => {
      findReviewForTenant.mockResolvedValue(review);

      await service.getReview({ user, reviewId: 'review-1' });

      expect(findReviewForTenant).toHaveBeenCalledWith({
        reviewId: 'review-1',
        tenantId: 'tenant-1',
      });
      expect(findResponsesForReviews).toHaveBeenCalledWith({
        reviewIds: ['review-1'],
        tenantId: 'tenant-1',
      });
    });

    it('throws NotFoundException when no review matches this tenant', async () => {
      findReviewForTenant.mockResolvedValue(null);

      await expect(service.getReview({ user, reviewId: 'missing' })).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('approveReply', () => {
    it('approves as-is when no content is submitted, keeping the original source', async () => {
      findResponseForTenant.mockResolvedValue(pendingResponse);
      approveResponse.mockResolvedValue({
        ...pendingResponse,
        status: ResponseStatus.APPROVED,
        approvedByUserId: 'user-1',
        decidedAt: '2026-03-12T09:05:00.000Z',
      });

      const result = await service.approveReply({
        user,
        reviewId: 'review-1',
        responseId: 'response-1',
      });

      expect(approveResponse).toHaveBeenCalledWith({
        responseId: 'response-1',
        reviewId: 'review-1',
        tenantId: 'tenant-1',
        approvedByUserId: 'user-1',
        content: pendingResponse.content,
        source: ResponseSource.AI_GENERATED,
      });
      expect(result.status).toBe('approved');
    });

    it('records human_edited when the submitted content differs from the original draft', async () => {
      findResponseForTenant.mockResolvedValue(pendingResponse);
      approveResponse.mockResolvedValue({ ...pendingResponse, status: ResponseStatus.APPROVED });

      await service.approveReply({
        user,
        reviewId: 'review-1',
        responseId: 'response-1',
        content: 'A rewritten reply.',
      });

      expect(approveResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'A rewritten reply.',
          source: ResponseSource.HUMAN_EDITED,
        })
      );
    });

    it('throws ReviewResponseNotFoundException when the response does not resolve for this tenant', async () => {
      findResponseForTenant.mockResolvedValue(null);

      await expect(
        service.approveReply({ user, reviewId: 'review-1', responseId: 'missing' })
      ).rejects.toThrow(NotFoundException);
      expect(approveResponse).not.toHaveBeenCalled();
    });

    it('throws ReviewResponseNotApprovableException when the CAS finds nothing pending', async () => {
      findResponseForTenant.mockResolvedValue(pendingResponse);
      approveResponse.mockResolvedValue(null);

      await expect(
        service.approveReply({ user, reviewId: 'review-1', responseId: 'response-1' })
      ).rejects.toThrow(ReviewResponseNotApprovableException);
    });

    it('throws ReviewResponseAlreadyLiveException on the live-reply unique-index conflict', async () => {
      findResponseForTenant.mockResolvedValue(pendingResponse);
      approveResponse.mockRejectedValue({
        code: '23505',
        constraint: 'idx_review_responses_review_id_live_reply',
      });

      await expect(
        service.approveReply({ user, reviewId: 'review-1', responseId: 'response-1' })
      ).rejects.toThrow(ReviewResponseAlreadyLiveException);
    });

    it('re-throws any other error from approveResponse unchanged', async () => {
      findResponseForTenant.mockResolvedValue(pendingResponse);
      const dbError = new Error('connection reset');
      approveResponse.mockRejectedValue(dbError);

      await expect(
        service.approveReply({ user, reviewId: 'review-1', responseId: 'response-1' })
      ).rejects.toThrow(dbError);
    });

    it('queues a post-back job when auto_post_enabled is true', async () => {
      findResponseForTenant.mockResolvedValue(pendingResponse);
      approveResponse.mockResolvedValue({ ...pendingResponse, status: ResponseStatus.APPROVED });
      findAutoPostEnabled.mockResolvedValue(true);

      await service.approveReply({ user, reviewId: 'review-1', responseId: 'response-1' });

      expect(addPostJob).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        reviewId: 'review-1',
        responseId: 'response-1',
      });
    });

    it('does not queue a post-back job when auto_post_enabled is false', async () => {
      findResponseForTenant.mockResolvedValue(pendingResponse);
      approveResponse.mockResolvedValue({ ...pendingResponse, status: ResponseStatus.APPROVED });
      findAutoPostEnabled.mockResolvedValue(false);

      await service.approveReply({ user, reviewId: 'review-1', responseId: 'response-1' });

      expect(addPostJob).not.toHaveBeenCalled();
    });

    it('does not fail the approval when the auto-post queue write itself fails', async () => {
      findResponseForTenant.mockResolvedValue(pendingResponse);
      approveResponse.mockResolvedValue({ ...pendingResponse, status: ResponseStatus.APPROVED });
      findAutoPostEnabled.mockResolvedValue(true);
      addPostJob.mockRejectedValue(new Error('queue unavailable'));

      await expect(
        service.approveReply({ user, reviewId: 'review-1', responseId: 'response-1' })
      ).resolves.toMatchObject({ status: 'approved' });
    });
  });

  describe('rejectReply', () => {
    it('records who rejected it and when, with no free-text reason', async () => {
      findResponseForTenant.mockResolvedValue(pendingResponse);
      rejectResponse.mockResolvedValue({
        ...pendingResponse,
        status: ResponseStatus.REJECTED,
        rejectedByUserId: 'user-1',
        decidedAt: '2026-03-12T09:05:00.000Z',
      });

      const result = await service.rejectReply({
        user,
        reviewId: 'review-1',
        responseId: 'response-1',
      });

      expect(rejectResponse).toHaveBeenCalledWith({
        responseId: 'response-1',
        reviewId: 'review-1',
        tenantId: 'tenant-1',
        rejectedByUserId: 'user-1',
      });
      expect(result.status).toBe('rejected');
    });

    it('throws ReviewResponseNotFoundException when the response does not resolve for this tenant', async () => {
      findResponseForTenant.mockResolvedValue(null);

      await expect(
        service.rejectReply({ user, reviewId: 'review-1', responseId: 'missing' })
      ).rejects.toThrow(NotFoundException);
      expect(rejectResponse).not.toHaveBeenCalled();
    });

    it('throws ReviewResponseNotApprovableException when the CAS finds nothing pending', async () => {
      findResponseForTenant.mockResolvedValue(pendingResponse);
      rejectResponse.mockResolvedValue(null);

      await expect(
        service.rejectReply({ user, reviewId: 'review-1', responseId: 'response-1' })
      ).rejects.toThrow(ConflictException);
    });
  });

  const postFailedResponse: ReviewResponseRow = {
    ...pendingResponse,
    status: ResponseStatus.POST_FAILED,
    errorMessage: 'Google API returned 429',
  };

  const approvedResponse: ReviewResponseRow = {
    ...pendingResponse,
    status: ResponseStatus.APPROVED,
    approvedByUserId: 'user-1',
  };

  describe('retryPost', () => {
    it('CASes post_failed -> approved and re-queues the post-back job', async () => {
      findReviewForTenant.mockResolvedValue(review);
      findResponseForTenant.mockResolvedValue(postFailedResponse);
      retryPostableResponse.mockResolvedValue({ ...postFailedResponse, status: 'approved' });

      const result = await service.retryPost({
        user,
        reviewId: 'review-1',
        responseId: 'response-1',
      });

      expect(retryPostableResponse).toHaveBeenCalledWith({
        responseId: 'response-1',
        tenantId: 'tenant-1',
      });
      expect(addPostJob).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        reviewId: 'review-1',
        responseId: 'response-1',
      });
      expect(result.status).toBe('approved');
      expect(result.errorMessage).toBeNull();
    });

    it('throws ReviewNotFoundException when the review does not resolve for this tenant', async () => {
      findReviewForTenant.mockResolvedValue(null);

      await expect(
        service.retryPost({ user, reviewId: 'missing', responseId: 'response-1' })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ResponseNotRetryableException when the response is not at post_failed', async () => {
      findReviewForTenant.mockResolvedValue(review);
      findResponseForTenant.mockResolvedValue(pendingResponse);

      await expect(
        service.retryPost({ user, reviewId: 'review-1', responseId: 'response-1' })
      ).rejects.toThrow(ResponseNotRetryableException);
      expect(retryPostableResponse).not.toHaveBeenCalled();
    });

    it.each([
      ['dismissed', { status: ReviewStatus.DISMISSED }, ReviewAlreadyDismissedException],
      [
        'removed on Google',
        { removedUpstreamAt: '2026-03-13T00:00:00.000Z' },
        ReviewRemovedUpstreamException,
      ],
    ])(
      'refuses to retry when the review is %s, before touching the response',
      async (_n, patch, exception) => {
        findReviewForTenant.mockResolvedValue({ ...review, ...patch });

        await expect(
          service.retryPost({ user, reviewId: 'review-1', responseId: 'response-1' })
        ).rejects.toThrow(exception);
        expect(retryPostableResponse).not.toHaveBeenCalled();
        expect(addPostJob).not.toHaveBeenCalled();
      }
    );

    it('puts the response back at post_failed and throws when the queue is unreachable', async () => {
      findReviewForTenant.mockResolvedValue(review);
      findResponseForTenant.mockResolvedValue(postFailedResponse);
      retryPostableResponse.mockResolvedValue({ ...postFailedResponse, status: 'approved' });
      addPostJob.mockRejectedValue(new Error('redis down'));

      await expect(
        service.retryPost({ user, reviewId: 'review-1', responseId: 'response-1' })
      ).rejects.toThrow(PostQueueUnavailableException);

      expect(markResponsePostFailed).toHaveBeenCalledWith({
        responseId: 'response-1',
        errorMessage: MESSAGES.REVIEWS.POST_QUEUE_UNAVAILABLE,
      });
    });

    it('throws ReviewAlreadyHasLiveReplyException on the live-reply unique-index conflict', async () => {
      findReviewForTenant.mockResolvedValue(review);
      findResponseForTenant.mockResolvedValue(postFailedResponse);
      retryPostableResponse.mockRejectedValue({
        code: '23505',
        constraint: 'idx_review_responses_review_id_live_reply',
      });

      await expect(
        service.retryPost({ user, reviewId: 'review-1', responseId: 'response-1' })
      ).rejects.toThrow(ReviewAlreadyHasLiveReplyException);
    });
  });

  describe('postResponse', () => {
    it('queues the post-back job for an approved response', async () => {
      findReviewForTenant.mockResolvedValue(review);
      findResponseForTenant.mockResolvedValue(approvedResponse);

      const result = await service.postResponse({
        user,
        reviewId: 'review-1',
        responseId: 'response-1',
      });

      expect(addPostJob).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        reviewId: 'review-1',
        responseId: 'response-1',
      });
      expect(result.status).toBe('approved');
    });

    it.each([
      ['dismissed', { status: ReviewStatus.DISMISSED }, ReviewAlreadyDismissedException],
      [
        'removed on Google',
        { removedUpstreamAt: '2026-03-13T00:00:00.000Z' },
        ReviewRemovedUpstreamException,
      ],
    ])('refuses to post when the review is %s', async (_n, patch, exception) => {
      findReviewForTenant.mockResolvedValue({ ...review, ...patch });

      await expect(
        service.postResponse({ user, reviewId: 'review-1', responseId: 'response-1' })
      ).rejects.toThrow(exception);
      expect(addPostJob).not.toHaveBeenCalled();
    });

    it('throws PostQueueUnavailableException and leaves the response approved when the queue is unreachable', async () => {
      findReviewForTenant.mockResolvedValue(review);
      findResponseForTenant.mockResolvedValue(approvedResponse);
      addPostJob.mockRejectedValue(new Error('redis down'));

      await expect(
        service.postResponse({ user, reviewId: 'review-1', responseId: 'response-1' })
      ).rejects.toThrow(PostQueueUnavailableException);
      expect(markResponsePostFailed).not.toHaveBeenCalled();
    });

    it('throws ResponseNotPostableException when the response is not at approved', async () => {
      findReviewForTenant.mockResolvedValue(review);
      findResponseForTenant.mockResolvedValue(pendingResponse);

      await expect(
        service.postResponse({ user, reviewId: 'review-1', responseId: 'response-1' })
      ).rejects.toThrow(ResponseNotPostableException);
      expect(addPostJob).not.toHaveBeenCalled();
    });
  });

  describe('getPostStatus', () => {
    it('returns the raw response status alongside the parent review status', async () => {
      findReviewForTenant.mockResolvedValue({ ...review, status: ReviewStatus.IN_REVIEW });
      findResponseForTenant.mockResolvedValue(postFailedResponse);

      const result = await service.getPostStatus({
        user,
        reviewId: 'review-1',
        responseId: 'response-1',
      });

      expect(result).toEqual({
        id: 'response-1',
        reviewId: 'review-1',
        status: ResponseStatus.POST_FAILED,
        postedAt: null,
        errorMessage: 'Google API returned 429',
        reviewStatus: ReviewStatus.IN_REVIEW,
      });
    });

    it('throws ReviewNotFoundException when the review does not resolve for this tenant', async () => {
      findReviewForTenant.mockResolvedValue(null);

      await expect(
        service.getPostStatus({ user, reviewId: 'missing', responseId: 'response-1' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createManualReply', () => {
    it('inserts a human_manual reply, deriving escalation_snippet for an escalated review', async () => {
      findReviewForTenant.mockResolvedValue({
        ...review,
        classification: ReviewClassification.ESCALATED,
      });
      insertManualReply.mockResolvedValue({
        response: {
          ...pendingResponse,
          responseType: ResponseType.ESCALATION_SNIPPET,
          source: ResponseSource.HUMAN_MANUAL,
          status: ResponseStatus.APPROVED,
          createdByUserId: 'user-1',
          approvedByUserId: 'user-1',
          decidedAt: '2026-03-12T09:05:00.000Z',
        },
        supersededResponseIds: ['response-2'],
      });

      const result = await service.createManualReply({
        user,
        reviewId: 'review-1',
        content: 'A manual reply.',
      });

      expect(insertManualReply).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        reviewId: 'review-1',
        responseType: ResponseType.ESCALATION_SNIPPET,
        content: 'A manual reply.',
        createdByUserId: 'user-1',
      });
      expect(result.supersededResponseIds).toEqual(['response-2']);
      expect(result.status).toBe('approved');
    });

    it('marks the reply post_failed, without failing the request, when the auto-post queue is unreachable', async () => {
      findReviewForTenant.mockResolvedValue(review);
      insertManualReply.mockResolvedValue({
        response: { ...approvedResponse, source: ResponseSource.HUMAN_MANUAL },
        supersededResponseIds: [],
      });
      findAutoPostEnabled.mockResolvedValue(true);
      addPostJob.mockRejectedValue(new Error('redis down'));

      const result = await service.createManualReply({
        user,
        reviewId: 'review-1',
        content: 'Hi there.',
      });

      expect(result.id).toBe('response-1');
      expect(markResponsePostFailed).toHaveBeenCalledWith({
        responseId: 'response-1',
        errorMessage: MESSAGES.REVIEWS.POST_QUEUE_UNAVAILABLE,
      });
    });

    it('derives auto_reply_suggestion for a non-escalated review', async () => {
      findReviewForTenant.mockResolvedValue(review);
      insertManualReply.mockResolvedValue({
        response: { ...pendingResponse, source: ResponseSource.HUMAN_MANUAL },
        supersededResponseIds: [],
      });

      await service.createManualReply({ user, reviewId: 'review-1', content: 'Hi there.' });

      expect(insertManualReply).toHaveBeenCalledWith(
        expect.objectContaining({ responseType: ResponseType.AUTO_REPLY_SUGGESTION })
      );
    });

    it('throws ReviewNotFoundException when the review does not resolve for this tenant', async () => {
      findReviewForTenant.mockResolvedValue(null);

      await expect(
        service.createManualReply({ user, reviewId: 'missing', content: 'Hi.' })
      ).rejects.toThrow(NotFoundException);
      expect(insertManualReply).not.toHaveBeenCalled();
    });

    it('throws ReviewAlreadyDismissedException for a dismissed review', async () => {
      findReviewForTenant.mockResolvedValue({ ...review, status: ReviewStatus.DISMISSED });

      await expect(
        service.createManualReply({ user, reviewId: 'review-1', content: 'Hi.' })
      ).rejects.toThrow(ReviewAlreadyDismissedException);
    });

    it('throws ReviewRemovedUpstreamException for a review removed on Google', async () => {
      findReviewForTenant.mockResolvedValue({
        ...review,
        removedUpstreamAt: '2026-03-10T00:00:00.000Z',
      });

      await expect(
        service.createManualReply({ user, reviewId: 'review-1', content: 'Hi.' })
      ).rejects.toThrow(ReviewRemovedUpstreamException);
    });

    it('throws ReviewAlreadyHasLiveReplyException on the live-reply unique-index conflict', async () => {
      findReviewForTenant.mockResolvedValue(review);
      insertManualReply.mockRejectedValue({
        code: '23505',
        constraint: 'idx_review_responses_review_id_live_reply',
      });

      await expect(
        service.createManualReply({ user, reviewId: 'review-1', content: 'Hi.' })
      ).rejects.toThrow(ReviewAlreadyHasLiveReplyException);
    });
  });
});
