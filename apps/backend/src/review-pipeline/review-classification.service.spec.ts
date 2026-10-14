import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewPipelineDbService } from '@db/repositories/review-pipeline/review-pipeline.db-service';
import { Test } from '@nestjs/testing';

import { ReviewClassificationService } from './review-classification.service';

import { InAppNotificationsService } from '../api/notifications/services/in-app-notifications.service';

describe('ReviewClassificationService.classifyPendingReviews', () => {
  let service: ReviewClassificationService;
  const loadClassificationContext = jest.fn();
  const findPendingReviews = jest.fn();
  const applyClassification = jest.fn();
  const publish = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    loadClassificationContext.mockResolvedValue({
      blocklistTerms: [],
      escalationRatingThreshold: 3,
    });
    applyClassification.mockResolvedValue(true);
    publish.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewClassificationService,
        {
          provide: ReviewPipelineDbService,
          useValue: { loadClassificationContext, findPendingReviews, applyClassification },
        },
        { provide: InAppNotificationsService, useValue: { publish } },
      ],
    }).compile();

    service = moduleRef.get(ReviewClassificationService);
  });

  it('returns zero counts when there is nothing pending', async () => {
    findPendingReviews.mockResolvedValue([]);

    const result = await service.classifyPendingReviews({
      tenantId: 'tenant-1',
      locationId: 'location-1',
    });

    expect(result).toEqual({ classified: 0, skipped: 0 });
    expect(applyClassification).not.toHaveBeenCalled();
  });

  it('classifies each pending review against the loaded context and claims it', async () => {
    findPendingReviews.mockResolvedValue([
      { id: 'review-1', rating: 5, reviewText: 'Great service.' },
      { id: 'review-2', rating: 1, reviewText: 'Terrible, would not recommend.' },
    ]);

    const result = await service.classifyPendingReviews({
      tenantId: 'tenant-1',
      locationId: 'location-1',
    });

    expect(result).toEqual({ classified: 2, skipped: 0 });
    expect(applyClassification).toHaveBeenCalledWith('review-1', {
      classification: ReviewClassification.AUTO_REPLY_CANDIDATE,
      escalationReason: null,
      matchedKeywords: null,
    });
    expect(applyClassification).toHaveBeenCalledWith('review-2', {
      classification: ReviewClassification.ESCALATED,
      escalationReason: EscalationReason.LOW_RATING,
      matchedKeywords: null,
    });
  });

  it('counts a lost claim CAS as skipped, not classified, and keeps processing the rest', async () => {
    findPendingReviews.mockResolvedValue([
      { id: 'review-1', rating: 5, reviewText: 'Great service.' },
      { id: 'review-2', rating: 5, reviewText: 'Also great.' },
    ]);
    applyClassification.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const result = await service.classifyPendingReviews({
      tenantId: 'tenant-1',
      locationId: 'location-1',
    });

    expect(result).toEqual({ classified: 1, skipped: 1 });
    expect(applyClassification).toHaveBeenCalledTimes(2);
  });

  it('loads the classification context once per call, not once per review', async () => {
    findPendingReviews.mockResolvedValue([
      { id: 'review-1', rating: 5, reviewText: null },
      { id: 'review-2', rating: 5, reviewText: null },
    ]);

    await service.classifyPendingReviews({ tenantId: 'tenant-1', locationId: 'location-1' });

    expect(loadClassificationContext).toHaveBeenCalledTimes(1);
    expect(loadClassificationContext).toHaveBeenCalledWith('tenant-1');
  });

  // The caller must see this throw to withhold `markBackfillComplete`; resolving would let a partial classification report a finished backfill.
  it('propagates a mid-batch claim failure instead of resolving with a partial count', async () => {
    findPendingReviews.mockResolvedValue([
      { id: 'review-1', rating: 5, reviewText: 'Great service.' },
      { id: 'review-2', rating: 1, reviewText: 'Bad.' },
      { id: 'review-3', rating: 5, reviewText: 'Fine.' },
    ]);
    applyClassification
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('connection terminated unexpectedly'));

    await expect(
      service.classifyPendingReviews({ tenantId: 'tenant-1', locationId: 'location-1' })
    ).rejects.toThrow('connection terminated unexpectedly');

    // Stopped at the failure — the third review was never attempted, so it stays pending.
    expect(applyClassification).toHaveBeenCalledTimes(2);
  });

  it('classifies a full batch without dropping any review', async () => {
    const batch = Array.from({ length: 2000 }, (_, index) => ({
      id: `review-${index}`,
      rating: 5,
      reviewText: 'Great service.',
    }));
    findPendingReviews.mockResolvedValue(batch);

    const result = await service.classifyPendingReviews({
      tenantId: 'tenant-1',
      locationId: 'location-1',
    });

    expect(result).toEqual({ classified: 2000, skipped: 0 });
    // The cap the service asks for must stay clear of one backfill's ceiling
    // (MAX_PAGES 20 x GBP_REVIEWS_PAGE_SIZE 50 = 1000), or a maxed-out import truncates.
    const requestedLimit = findPendingReviews.mock.calls[0]?.[2] as number;
    expect(requestedLimit).toBeGreaterThan(20 * 50);
  });
  describe('in-app notifications', () => {
    it('raises one notice per escalated review, in a single call for the run', async () => {
      findPendingReviews.mockResolvedValue([
        { id: 'review-1', rating: 5, reviewText: 'Great service.' },
        { id: 'review-2', rating: 1, reviewText: 'Terrible.' },
        { id: 'review-3', rating: 2, reviewText: 'Bad.' },
      ]);

      await service.classifyPendingReviews({ tenantId: 'tenant-1', locationId: 'location-1' });

      expect(publish).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenCalledWith('tenant-1', [
        { type: InAppNotificationType.REVIEW_ESCALATED, reviewId: 'review-2', rating: 1 },
        { type: InAppNotificationType.REVIEW_ESCALATED, reviewId: 'review-3', rating: 2 },
      ]);
    });

    // Regression: notices were published after the loop, so a failure mid-batch dropped them, and a classified review is never revisited.
    it('still raises the notices for the reviews classified before a later one fails', async () => {
      findPendingReviews.mockResolvedValue([
        { id: 'review-1', rating: 1, reviewText: 'Terrible.' },
        { id: 'review-2', rating: 1, reviewText: 'Awful.' },
      ]);
      applyClassification
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('connection terminated'));

      await expect(
        service.classifyPendingReviews({ tenantId: 'tenant-1', locationId: 'location-1' })
      ).rejects.toThrow('connection terminated');

      expect(publish).toHaveBeenCalledWith('tenant-1', [
        { type: InAppNotificationType.REVIEW_ESCALATED, reviewId: 'review-1', rating: 1 },
      ]);
    });

    it('does not announce a review whose claim was lost to another worker', async () => {
      findPendingReviews.mockResolvedValue([
        { id: 'review-2', rating: 1, reviewText: 'Terrible.' },
      ]);
      applyClassification.mockResolvedValue(false);

      await service.classifyPendingReviews({ tenantId: 'tenant-1', locationId: 'location-1' });

      expect(publish).toHaveBeenCalledWith('tenant-1', []);
    });
  });
});
