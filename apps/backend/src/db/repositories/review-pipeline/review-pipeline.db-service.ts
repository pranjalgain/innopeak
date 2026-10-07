import { MESSAGES } from '@common/constants/messages.constants';
import { Injectable } from '@nestjs/common';
import type {
  ClassifiableReview,
  ClassificationContext,
  ClassificationResult,
} from '@review-pipeline/types/classification-result.type';

import { ReviewSyncRepository } from '../review-sync/review-sync.repository';
import type { ClaimClassificationInput } from '../review-sync/types/review-sync.type';
import { BlocklistTermsRepository } from '../settings/blocklist-terms.repository';
import { TenantSettingsRepository } from '../settings/tenant-settings.repository';

/** Repositories may not compose each other; this class composes the ones classification needs. */
@Injectable()
export class ReviewPipelineDbService {
  constructor(
    private readonly reviewSyncRepository: ReviewSyncRepository,
    private readonly blocklistTermsRepository: BlocklistTermsRepository,
    private readonly tenantSettingsRepository: TenantSettingsRepository
  ) {}

  /** Every tenant gets a `tenant_settings` row at signup, so a missing one is a broken invariant: fail loudly, no default. */
  async loadClassificationContext(tenantId: string): Promise<ClassificationContext> {
    const [terms, escalationRatingThreshold] = await Promise.all([
      this.blocklistTermsRepository.listByTenant(tenantId),
      this.tenantSettingsRepository.findEscalationRatingThreshold(tenantId),
    ]);

    if (escalationRatingThreshold === null) {
      throw new Error(MESSAGES.SETTINGS.TENANT_SETTINGS_ROW_MISSING(tenantId));
    }

    return {
      blocklistTerms: terms.map(term => term.term),
      escalationRatingThreshold,
    };
  }

  findPendingReviews(
    tenantId: string,
    locationId: string,
    limit: number
  ): Promise<ClassifiableReview[]> {
    return this.reviewSyncRepository.findPendingClassification(tenantId, locationId, limit);
  }

  applyClassification(reviewId: string, result: ClassificationResult): Promise<boolean> {
    const input: ClaimClassificationInput = {
      classification: result.classification,
      escalationReason: result.escalationReason,
      matchedKeywords: result.matchedKeywords,
    };

    return this.reviewSyncRepository.claimClassification(reviewId, input);
  }
}
