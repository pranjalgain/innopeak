import { JobName, QueueName } from '@bg/constants/job.constant';
import { IReviewBackfillJob, IReviewSyncJob } from '@bg/interfaces/job.interface';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ReviewSyncQueueService } from '@review-sync-queue/review-sync-queue.service';
import { Job } from 'bullmq';

/**
 * Low concurrency and a generous `stalledInterval`: a backfill is long-running and quota-consuming,
 * and a job legitimately mid-page must not be declared stalled and duplicated onto a second worker.
 */
@Processor(QueueName.REVIEW_SYNC, {
  concurrency: 2,
  drainDelay: 300,
  stalledInterval: 300000, // 5 minutes
  maxStalledCount: 2,
})
export class ReviewSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ReviewSyncProcessor.name);

  constructor(
    private readonly reviewSyncQueueService: ReviewSyncQueueService,
    private readonly dlqService: DeadLetterQueueService
  ) {
    super();
  }

  async process(job: Job<IReviewSyncJob, void, JobName>): Promise<void> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    try {
      switch (job.name) {
        case JobName.REVIEW_BACKFILL:
          // Safe: only REVIEW_BACKFILL jobs are published with `syncRunId` (`ReviewSyncQueue.addBackfillJob`).
          // `attemptsMade` is 0 on the first execution, so `> 0` means this is the retry.
          await this.reviewSyncQueueService.runBackfill(
            job.data as IReviewBackfillJob,
            job.attemptsMade > 0
          );
          break;
        case JobName.REVIEW_POLL:
          await this.reviewSyncQueueService.runPoll(job.data);
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

  /** BullMQ fires `failed` after every attempt; only forward to the DLQ once retries are exhausted (default 1 attempt). */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<IReviewSyncJob, void, JobName>): Promise<void> {
    this.logger.error(`Job ${job.id} has failed: ${job.failedReason}`);

    if (job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }

    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.REVIEW_SYNC,
      originalJobId: job.id ?? '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      timestamp: Date.now(),
    });
  }

  @OnWorkerEvent('stalled')
  async onStalled(job: Job<IReviewSyncJob, void, JobName>): Promise<void> {
    this.logger.error(`Job ${job.id} has been stalled`);

    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.REVIEW_SYNC,
      originalJobId: job.id ?? '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: `Job stalled for too long. Current attempts: ${job.attemptsMade}`,
      timestamp: Date.now(),
    });
  }
}
