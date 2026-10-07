import { JobName, QueueName } from '@bg/constants/job.constant';
import { IReviewPostJob } from '@bg/interfaces/job.interface';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ReviewPostQueueService } from '@review-post-queue/review-post-queue.service';
import { Job } from 'bullmq';

/**
 * `concurrency: 3`: one short Google PUT/GET pair per job, like email sends, not a long paginating
 * import.
 */
@Processor(QueueName.REVIEW_POST, {
  concurrency: 3,
  drainDelay: 300,
  stalledInterval: 300000, // 5 minutes
  maxStalledCount: 2,
})
export class ReviewPostProcessor extends WorkerHost {
  private readonly logger = new Logger(ReviewPostProcessor.name);

  constructor(
    private readonly reviewPostQueueService: ReviewPostQueueService,
    private readonly dlqService: DeadLetterQueueService
  ) {
    super();
  }

  async process(job: Job<IReviewPostJob, void, JobName>): Promise<void> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    try {
      switch (job.name) {
        case JobName.REVIEW_POST:
          await this.reviewPostQueueService.postResponse(job.data);
          break;
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed job ${job.id} (${job.name}): ${(error as Error).message}`,
        (error as Error).stack
      );
      throw error;
    }
  }

  /**
   * `attempts: 1` means `attemptsMade` is always `0` and every failure is final, so it is forwarded
   * to the DLQ unconditionally.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<IReviewPostJob, void, JobName>): Promise<void> {
    this.logger.error(`Job ${job.id} has failed: ${job.failedReason}`);

    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.REVIEW_POST,
      originalJobId: job.id ?? '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      timestamp: Date.now(),
    });
  }

  @OnWorkerEvent('stalled')
  async onStalled(job: Job<IReviewPostJob, void, JobName>): Promise<void> {
    this.logger.error(`Job ${job.id} has been stalled`);

    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.REVIEW_POST,
      originalJobId: job.id ?? '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: `Job stalled for too long. Current attempts: ${job.attemptsMade}`,
      timestamp: Date.now(),
    });
  }
}
