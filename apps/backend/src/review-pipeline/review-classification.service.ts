import { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewPipelineDbService } from '@db/repositories/review-pipeline/review-pipeline.db-service';
import { Injectable, Logger } from '@nestjs/common';

import { classifyReview } from './review-classification.rule';
import type {
  ClassifyPendingReviewsInput,
  ClassifyPendingReviewsResult,
} from './types/classification-result.type';

import { InAppNotificationsService } from '../api/notifications/services/in-app-notifications.service';
import type { InAppNotificationEvent } from '../api/notifications/types/in-app-notification-event.type';

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

  constructor(
    private readonly reviewPipelineDbService: ReviewPipelineDbService,
    private readonly inAppNotificationsService: InAppNotificationsService
  ) {}

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
    const escalations: InAppNotificationEvent[] = [];

    // In a `finally`: a review that is classified is no longer pending, so a notice lost to a later failure in this batch (a rejected
    // claim, a killed worker) would never be raised again. One call per run, so a burst (a first backfill) folds into a few notices and a
    // summary instead of one per review.
    try {
      for (const review of pendingReviews) {
        const result = classifyReview(review, context);
        const claimed = await this.reviewPipelineDbService.applyClassification(review.id, result);

        if (claimed) {
          classified += 1;
          if (result.classification === ReviewClassification.ESCALATED) {
            escalations.push({
              type: InAppNotificationType.REVIEW_ESCALATED,
              reviewId: review.id,
              rating: review.rating,
            });
          }
        } else {
          skipped += 1;
          this.logger.warn(
            `Review ${review.id} stopped being a classification candidate before it could be claimed (already classified, or no longer 'new'); skipping.`
          );
        }
      }
    } finally {
      await this.inAppNotificationsService.publish(input.tenantId, escalations);
    }

    this.logger.log(
      `Classified ${classified}/${pendingReviews.length} pending reviews for location ${input.locationId} (${skipped} skipped).`
    );

    return { classified, skipped };
  }
}
