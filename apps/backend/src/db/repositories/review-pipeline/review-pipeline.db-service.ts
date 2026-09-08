import { Injectable } from '@nestjs/common';
import type {
  ClassifiableReview,
  ClassificationContext,
  ClassificationResult,
} from '@review-pipeline/types/classification-result.type';

import {
  type ClaimClassificationInput,
  ReviewSyncRepository,
} from '../review-sync/review-sync.repository';
import { BlocklistTermsRepository } from '../settings/blocklist-terms.repository';
import { TenantSettingsRepository } from '../settings/tenant-settings.repository';

/**
 * Composes the three repositories `review-classification.rule.ts` needs a context and a queue
 * from: `reviews` (owned by `ReviewSyncRepository`), `blocklist_terms` and `tenant_settings`. None
 * of those repositories may compose each other — that composition is this class's entire job.
 */
@Injectable()
export class ReviewPipelineDbService {
  constructor(
    private readonly reviewSyncRepository: ReviewSyncRepository,
    private readonly blocklistTermsRepository: BlocklistTermsRepository,
    private readonly tenantSettingsRepository: TenantSettingsRepository
  ) {}

  /**
   * Every tenant gets a `tenant_settings` row at signup (`auth.repository.ts`), so a missing
   * threshold here means that invariant broke, not a normal "tenant hasn't configured this yet"
   * case — worth failing loudly rather than silently falling back to a guessed default.
   */
  async loadClassificationContext(tenantId: string): Promise<ClassificationContext> {
    const [terms, escalationRatingThreshold] = await Promise.all([
      this.blocklistTermsRepository.listByTenant(tenantId),
      this.tenantSettingsRepository.findEscalationRatingThreshold(tenantId),
    ]);

    if (escalationRatingThreshold === null) {
      throw new Error(`No tenant_settings row found for tenant ${tenantId}`);
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
