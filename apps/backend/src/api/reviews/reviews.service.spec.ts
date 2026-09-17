import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { TenantAuthUser } from '@auth/types/auth-user.type';
import { ResponseSource } from '@common/enums/response-source.enum';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type { ReviewRow } from '@db/repositories/review-sync/reviews-read.repository';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

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

describe('ReviewsService', () => {
  let service: ReviewsService;
  const listReviews = jest.fn();
  const findReviewForTenant = jest.fn();
  const findResponsesForReviews = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    findResponsesForReviews.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: ReviewSyncDbService,
          useValue: { listReviews, findReviewForTenant, findResponsesForReviews },
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
});
