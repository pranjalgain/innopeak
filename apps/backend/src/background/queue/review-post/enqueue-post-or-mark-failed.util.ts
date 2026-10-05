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
 * Queues a post job for an `approved` response and, if the queue cannot be reached, moves the
 * response to `post_failed` instead of leaving it `approved` with no job behind it.
 *
 * `approved` is also the legitimate resting state of a reply nobody has chosen to post yet, so an
 * approved row with no job is indistinguishable from one that was never meant to post — nothing
 * could ever sweep it. `post_failed` is the one state the UI already surfaces with a retry control,
 * which makes a failed enqueue visible and recoverable with no new mechanism. Returns whether the
 * job was queued; never throws for a queue failure.
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
