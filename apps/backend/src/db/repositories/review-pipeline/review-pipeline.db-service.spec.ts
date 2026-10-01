import { MESSAGES } from '@common/constants/messages.constants';
import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { Test } from '@nestjs/testing';

import { ReviewPipelineDbService } from './review-pipeline.db-service';

import { ReviewSyncRepository } from '../review-sync/review-sync.repository';
import { BlocklistTermsRepository } from '../settings/blocklist-terms.repository';
import { TenantSettingsRepository } from '../settings/tenant-settings.repository';

describe('ReviewPipelineDbService', () => {
  let service: ReviewPipelineDbService;
  const listByTenant = jest.fn();
  const findEscalationRatingThreshold = jest.fn();
  const findPendingClassification = jest.fn();
  const claimClassification = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewPipelineDbService,
        {
          provide: ReviewSyncRepository,
          useValue: { findPendingClassification, claimClassification },
        },
        { provide: BlocklistTermsRepository, useValue: { listByTenant } },
        { provide: TenantSettingsRepository, useValue: { findEscalationRatingThreshold } },
      ],
    }).compile();

    service = moduleRef.get(ReviewPipelineDbService);
  });

  describe('loadClassificationContext', () => {
    it('combines the tenant blocklist terms and rating threshold', async () => {
      listByTenant.mockResolvedValue([
        { id: 'term-1', term: 'scam', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'term-2', term: 'lawsuit', createdAt: '2026-01-01T00:00:00.000Z' },
      ]);
      findEscalationRatingThreshold.mockResolvedValue(3);

      const context = await service.loadClassificationContext('tenant-1');

      expect(context).toEqual({
        blocklistTerms: ['scam', 'lawsuit'],
        escalationRatingThreshold: 3,
      });
    });

    it('throws when the tenant has no tenant_settings row, rather than guessing a default', async () => {
      listByTenant.mockResolvedValue([]);
      findEscalationRatingThreshold.mockResolvedValue(null);

      await expect(service.loadClassificationContext('tenant-1')).rejects.toThrow(
        MESSAGES.SETTINGS.TENANT_SETTINGS_ROW_MISSING('tenant-1')
      );
    });
  });

  describe('findPendingReviews', () => {
    it('delegates to the review-sync repository with the given limit', async () => {
      findPendingClassification.mockResolvedValue([
        { id: 'review-1', rating: 5, reviewText: 'Great!' },
      ]);

      const reviews = await service.findPendingReviews('tenant-1', 'location-1', 500);

      expect(findPendingClassification).toHaveBeenCalledWith('tenant-1', 'location-1', 500);
      expect(reviews).toEqual([{ id: 'review-1', rating: 5, reviewText: 'Great!' }]);
    });
  });

  describe('applyClassification', () => {
    it('passes the classification result through to the CAS claim', async () => {
      claimClassification.mockResolvedValue(true);

      const claimed = await service.applyClassification('review-1', {
        classification: ReviewClassification.ESCALATED,
        escalationReason: EscalationReason.BLOCKLIST_MATCH,
        matchedKeywords: ['scam'],
      });

      expect(claimed).toBe(true);
      expect(claimClassification).toHaveBeenCalledWith('review-1', {
        classification: ReviewClassification.ESCALATED,
        escalationReason: EscalationReason.BLOCKLIST_MATCH,
        matchedKeywords: ['scam'],
      });
    });

    it('returns false when the CAS is lost to a concurrent classification', async () => {
      claimClassification.mockResolvedValue(false);

      const claimed = await service.applyClassification('review-1', {
        classification: ReviewClassification.AUTO_REPLY_CANDIDATE,
        escalationReason: null,
        matchedKeywords: null,
      });

      expect(claimed).toBe(false);
    });
  });
});
