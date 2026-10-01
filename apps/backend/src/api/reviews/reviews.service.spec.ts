import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { TenantAuthUser } from '@auth/types/auth.type';
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
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import {
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

  beforeEach(async () => {
    jest.clearAllMocks();
    findResponsesForReviews.mockResolvedValue([]);

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
          },
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
});
