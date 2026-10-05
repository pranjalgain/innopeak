import { JobName, QueueName } from '@bg/constants/job.constant';
import { IReviewPostJob } from '@bg/interfaces/job.interface';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ReviewPostQueue {
  private readonly logger = new Logger(ReviewPostQueue.name);

  constructor(private readonly queuePublisher: QueuePublisherProvider) {}

  async addPostJob(data: IReviewPostJob, options?: { delayMs?: number }): Promise<void> {
    this.logger.debug(`Adding review-post job for response ${data.responseId}`);
    await this.queuePublisher.publish(
      QueueName.REVIEW_POST,
      JobName.REVIEW_POST,
      data,
      options?.delayMs ? { delayMs: options.delayMs } : undefined
    );
  }
}
