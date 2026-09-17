import { JobName, QueueName } from '@bg/constants/job.constant';
import { IReviewBackfillJob, IReviewSyncJob } from '@bg/interfaces/job.interface';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ReviewSyncQueueService } from '@review-sync-queue/review-sync-queue.service';
import { Job } from 'bullmq';

/**
 * `concurrency: 2`, well below the email queue's 3-with-a-limiter: a backfill is a long-running,
 * quota-consuming conversation with Google, not a burst of short sends. `stalledInterval` is
 * generous for the same reason — a job legitimately mid-page must not be declared stalled and
 * duplicated onto a second worker, which would race the same sync run.
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
          // Safe: only a `JobName.REVIEW_BACKFILL` job is ever published with the extra
          // `syncRunId` `IReviewBackfillJob` requires (`ReviewSyncQueue.addBackfillJob`) — this
          // switch is what BullMQ's own typing can't express that guarantee through.
          //
          // `job.attemptsMade` is 0 during the first execution and only becomes 1 once a prior
          // attempt has thrown and BullMQ re-fetches the job for its retry (`attempts: 2`) — so
          // `> 0` here means "this is that retry", never the first pass.
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

  /**
   * BullMQ fires `failed` after *every* failed attempt, not only the last one — so a job that
   * fails once and then succeeds on retry used to land in the DLQ anyway, even though nothing
   * ultimately failed. The DLQ never replays, so that corrupted the signal (a "failure" that
   * later self-healed) rather than causing any double-processing. Only forward it once BullMQ
   * itself has given up — `attemptsMade` has reached `opts.attempts` (default 1 if unset).
   */
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
