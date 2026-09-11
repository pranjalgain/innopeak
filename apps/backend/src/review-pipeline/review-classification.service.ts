import { ReviewPipelineDbService } from '@db/repositories/review-pipeline/review-pipeline.db-service';
import { Injectable, Logger } from '@nestjs/common';

import { classifyReview } from './review-classification.rule';

export interface ClassifyPendingReviewsInput {
  tenantId: string;
  locationId: string;
}

export interface ClassifyPendingReviewsResult {
  classified: number;
  /** Lost the claim CAS — another worker classified the review first, or it stopped being `new`
   *  between the queue read and the write. See `ReviewSyncRepository.claimClassification`. */
  skipped: number;
}

/**
 * Deliberately above what one import can produce, and that margin has to be maintained by hand:
 * a backfill imports at most `MAX_PAGES` (20, `review-sync-queue.service.ts`) ×
 * `GBP_REVIEWS_PAGE_SIZE` (50, `review-provider.constants.ts`) = **1000** reviews, so a limit of
 * 1000 would sit exactly on that ceiling rather than clear of it. These three constants are
 * coupled across three files with nothing enforcing the relationship, so raising `MAX_PAGES` or
 * the page size without raising this silently reintroduces truncation.
 *
 * Truncation is not data loss — the remainder keeps `classification = 'pending_classification'`
 * and a later run picks it up — but with no poller yet, "a later run" means re-triggering
 * backfill by hand, so it is worth not hitting.
 */
const BATCH_LIMIT = 2000;

/**
 * The sole public entrypoint for this module — everything else here is private plumbing. Composes
 * the pure `classifyReview` rule (PLAN.md §3) with the pending-review queue: read the tenant's
 * current blocklist/threshold once, then classify and claim each pending review one at a time.
 *
 * Per-review, not batched into one write, so that one review losing its claim CAS (§8.3) never
 * blocks the rest of the batch.
 */
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
