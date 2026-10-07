import type { IReviewPostJob } from '@bg/interfaces/job.interface';
import { MESSAGES } from '@common/constants/messages.constants';
import type { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type { Logger } from '@nestjs/common';

import type { ReviewPostQueue } from './review-post.queue';

interface EnqueuePostDeps {
  reviewPostQueue: ReviewPostQueue;
  reviewSyncDbService: ReviewSyncDbService;
  logger: Logger;
}

/**
 * On enqueue failure, marks the response `post_failed` rather than leaving it `approved` with no
 * job: `approved` is also a legitimate resting state so nothing could sweep an orphan, while
 * `post_failed` already has a UI retry control. Never throws for a queue failure.
 */
export async function enqueuePostOrMarkFailed(
  deps: EnqueuePostDeps,
  job: IReviewPostJob
): Promise<boolean> {
  try {
    await deps.reviewPostQueue.addPostJob(job);
    return true;
  } catch (error) {
    deps.logger.error(
      `Could not queue post for response ${job.responseId} (review ${job.reviewId}): ${
        error instanceof Error ? error.message : String(error)
      }. Marking it post_failed so it can be retried.`
    );
    try {
      await deps.reviewSyncDbService.markResponsePostFailed({
        responseId: job.responseId,
        errorMessage: MESSAGES.REVIEWS.POST_QUEUE_UNAVAILABLE,
      });
    } catch (markError) {
      deps.logger.error(
        `Also failed to record post_failed for response ${job.responseId}: ${
          markError instanceof Error ? markError.message : String(markError)
        }`
      );
    }
    return false;
  }
}
