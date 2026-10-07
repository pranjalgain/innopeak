import { ReviewPipelineDbService } from '@db/repositories/review-pipeline/review-pipeline.db-service';
import { Injectable, Logger } from '@nestjs/common';

import { classifyReview } from './review-classification.rule';
import type {
  ClassifyPendingReviewsInput,
  ClassifyPendingReviewsResult,
} from './types/classification-result.type';

/**
 * Deliberately above one import's ceiling, maintained by hand: a backfill imports at most `MAX_PAGES` (20,
 * `review-sync-queue.service.ts`) × `GBP_REVIEWS_PAGE_SIZE` (50, `review-provider.constants.ts`) = 1000 reviews.
 * Nothing enforces that coupling, so raising either without raising this reintroduces truncation (the remainder
 * stays `pending_classification` until a later run).
 */
const BATCH_LIMIT = 2000;

/** Sole public entrypoint of this module. Classifies per review, not in one batched write, so one review losing its claim CAS never blocks the rest. */
@Injectable()
export class ReviewClassificationService {
  private readonly logger = new Logger(ReviewClassificationService.name);

  constructor(private readonly reviewPipelineDbService: ReviewPipelineDbService) {}

  async classifyPendingReviews(
    input: ClassifyPendingReviewsInput
  ): Promise<ClassifyPendingReviewsResult> {
    const context = await this.reviewPipelineDbService.loadClassificationContext(input.tenantId);
    const pendingReviews = await this.reviewPipelineDbService.findPendingReviews(
      input.tenantId,
      input.locationId,
      BATCH_LIMIT
    );

    // `length === BATCH_LIMIT` proves the query was capped, not that anything was left behind —
    // a queue of exactly BATCH_LIMIT reads as capped and has no remainder. Worded to match.
    if (pendingReviews.length === BATCH_LIMIT) {
      this.logger.warn(
        `Pending classification queue for location ${input.locationId} filled the ${BATCH_LIMIT}-review batch limit; any reviews beyond it stay pending_classification until the next backfill or 15-minute poll tick.`
      );
    }

    let classified = 0;
    let skipped = 0;

    for (const review of pendingReviews) {
      const result = classifyReview(review, context);
      const claimed = await this.reviewPipelineDbService.applyClassification(review.id, result);

      if (claimed) {
        classified += 1;
      } else {
        skipped += 1;
        this.logger.warn(
          `Review ${review.id} stopped being a classification candidate before it could be claimed (already classified, or no longer 'new'); skipping.`
        );
      }
    }

    this.logger.log(
      `Classified ${classified}/${pendingReviews.length} pending reviews for location ${input.locationId} (${skipped} skipped).`
    );

    return { classified, skipped };
  }
}
