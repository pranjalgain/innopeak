import { JobName, QueueName } from '@bg/constants/job.constant';
import { IReviewBackfillJob, IReviewSyncJob } from '@bg/interfaces/job.interface';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

const POLL_DEDUPE_WINDOW_MS = 10 * 60_000;
const COMPLETED_POLL_RETENTION_SECONDS = 60 * 60;

/**
 * Publishes straight to BullMQ, not through `QueuePublisherProvider`: review sync has no SQS
 * consumer, so under `DEPLOYMENT_TARGET=aws` the abstraction would silently enqueue jobs nothing runs.
 */
@Injectable()
export class ReviewSyncQueue {
  private readonly logger = new Logger(ReviewSyncQueue.name);

  constructor(@InjectQueue(QueueName.REVIEW_SYNC) private readonly queue: Queue) {}

  /** `attempts: 2`, not the global 3: the import is idempotent but each attempt re-paginates Google from scratch, burning API quota. */
  async addBackfillJob(data: IReviewBackfillJob): Promise<void> {
    this.logger.debug(`Queueing review backfill for location ${data.locationId}`);
    await this.queue.add(JobName.REVIEW_BACKFILL, data, { attempts: 2 });
  }

  /**
   * One poll per location per ten minutes: the id carries the window, so a second enqueue of the same tick (an overlapping fan-out, a retried
   * cron job) is ignored instead of polling Google twice. Completed polls are dropped after an hour rather than kept for the queue's week:
   * a poll runs every 15 minutes per location, so a week of them was thousands of finished jobs per location in Redis for nothing.
   */
  async addPollJob(data: IReviewSyncJob): Promise<void> {
    this.logger.debug(`Queueing review poll for location ${data.locationId}`);
    const window = Math.floor(Date.now() / POLL_DEDUPE_WINDOW_MS);
    await this.queue.add(JobName.REVIEW_POLL, data, {
      jobId: `review-poll-${data.locationId}-${window}`,
      removeOnComplete: { age: COMPLETED_POLL_RETENTION_SECONDS },
    });
  }
}
