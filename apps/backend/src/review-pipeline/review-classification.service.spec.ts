import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewPipelineDbService } from '@db/repositories/review-pipeline/review-pipeline.db-service';
import { Test } from '@nestjs/testing';

import { ReviewClassificationService } from './review-classification.service';

describe('ReviewClassificationService.classifyPendingReviews', () => {
  let service: ReviewClassificationService;
  const loadClassificationContext = jest.fn();
  const findPendingReviews = jest.fn();
  const applyClassification = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    loadClassificationContext.mockResolvedValue({
      blocklistTerms: [],
      escalationRatingThreshold: 3,
    });
    applyClassification.mockResolvedValue(true);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewClassificationService,
        {
          provide: ReviewPipelineDbService,
          useValue: { loadClassificationContext, findPendingReviews, applyClassification },
        },
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

  /**
   * The path that made a swallowed failure dangerous: the caller has to see this throw to know it
   * must withhold `markBackfillComplete`. If this ever resolves instead, a partial classification
   * silently reports a finished backfill again.
   */
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
});
