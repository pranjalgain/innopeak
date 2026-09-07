import { JobName, QueueName } from '@bg/constants/job.constant';
import { IReviewBackfillJob } from '@bg/interfaces/job.interface';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

/**
 * Publishes straight to BullMQ rather than through `QueuePublisherProvider`.
 *
 * Every other producer in this codebase goes through that abstraction because its queue has both
 * a BullMQ processor and an SQS consumer, and the transport is chosen by `DEPLOYMENT_TARGET`.
 * Review sync is BullMQ-only (see ReviewSyncQueueModule), so publishing through the abstraction
 * would send jobs to SQS under `DEPLOYMENT_TARGET=aws` where nothing consumes them — backfills
 * would be enqueued, acknowledged, and silently never run. Binding the producer to the same
 * transport as the consumer makes that mismatch impossible rather than merely unlikely.
 */
@Injectable()
export class ReviewSyncQueue {
  private readonly logger = new Logger(ReviewSyncQueue.name);

  constructor(@InjectQueue(QueueName.REVIEW_SYNC) private readonly queue: Queue) {}

  /**
   * `attempts: 2`, not the global 3. The import is idempotent (every write is an upsert on a
   * unique key), so a retry is safe — but each attempt re-paginates against Google from scratch,
   * and burning an owner's API quota three times over during onboarding is a poor trade for the
   * third chance.
   */
  async addBackfillJob(data: IReviewBackfillJob): Promise<void> {
    this.logger.debug(`Queueing review backfill for location ${data.locationId}`);
    await this.queue.add(JobName.REVIEW_BACKFILL, data, { attempts: 2 });
  }
}
