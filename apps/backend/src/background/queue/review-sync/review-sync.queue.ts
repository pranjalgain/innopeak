import { JobName, QueueName } from '@bg/constants/job.constant';
import { IReviewBackfillJob, IReviewSyncJob } from '@bg/interfaces/job.interface';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

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

  async addPollJob(data: IReviewSyncJob): Promise<void> {
    this.logger.debug(`Queueing review poll for location ${data.locationId}`);
    await this.queue.add(JobName.REVIEW_POLL, data);
  }
}
