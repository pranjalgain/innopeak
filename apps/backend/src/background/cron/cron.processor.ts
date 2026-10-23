import { CronJobName, QueueName } from '@bg/constants/job.constant';
import { ICronJob } from '@bg/interfaces/job.interface';
import { CronService } from '@cron/cron.service';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

type CronJobHandle = Job<ICronJob, void, CronJobName>;

@Processor(QueueName.CRON, {
  concurrency: 3,
  drainDelay: 300,
  stalledInterval: 300000, // 5 minutes
  maxStalledCount: 3,
  limiter: {
    max: 5,
    duration: 150,
  },
})
export class CronProcessor extends WorkerHost {
  private readonly logger = new Logger(CronProcessor.name);

  constructor(
    private readonly cronService: CronService,
    private readonly dlqService: DeadLetterQueueService
  ) {
    super();
  }

  async process(job: CronJobHandle, _token?: string): Promise<void> {
    let logMessage = `Processing job ${job.id} of type ${job.name} with data ${JSON.stringify(job.data)}...`;
    this.logger.debug(logMessage, 'CronProcessor');
    if (typeof job.log === 'function') void job.log(logMessage);

    try {
      switch (job.name) {
        case CronJobName.DAILY_MAIL:
          this.cronService.sendDailyMail(job.data);
          break;
        case CronJobName.AUTH_TOKEN_CLEANUP:
          await this.cronService.purgeStaleAuthTokens();
          break;
        case CronJobName.NOTIFICATION_RETENTION_PURGE:
          await this.cronService.purgeOldNotifications();
          break;
        case CronJobName.REVIEW_SYNC_POLL:
          await this.cronService.pollDueLocations();
          break;
        case CronJobName.REVIEWER_RETENTION_PURGE:
          await this.cronService.purgeExpiredReviewerPii();
          break;
        case CronJobName.ERASURE_PURGE:
          await this.cronService.purgeErasureRequests();
          break;
        case CronJobName.BILLING_RECONCILIATION_SWEEP:
          await this.cronService.reconcileStaleBillingSubscriptions();
          break;
        default: {
          const unhandled: never = job.name;
          throw new Error(`Unknown job name: ${String(unhandled)}`);
        }
      }

      logMessage = `Completed job ${job.id} of type ${job.name}`;
      this.logger.debug(logMessage, 'CronProcessor');
      if (typeof job.log === 'function') void job.log(logMessage);
    } catch (error) {
      logMessage = `Failed to process job ${job.id} of type ${job.name} with error ${(error as Error).message}`;
      this.logger.error(logMessage, (error as Error).stack, 'CronProcessor');
      if (typeof job.log === 'function') void job.log(logMessage);
      throw error;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: CronJobHandle): void {
    this.logger.debug(`Job ${job.id} is now active`);
    if (typeof job.log === 'function') void job.log(`Job ${job.id} is now active`);
  }

  @OnWorkerEvent('progress')
  onProgress(job: CronJobHandle): void {
    this.logger.debug(`Job ${job.id} is ${JSON.stringify(job.progress)}% complete`);
    if (typeof job.log === 'function')
      void job.log(`Job ${job.id} is ${JSON.stringify(job.progress)}% complete`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: CronJobHandle): void {
    this.logger.debug(`Job ${job.id} has been completed`);
    if (typeof job.log === 'function') void job.log(`Job ${job.id} has been completed`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: CronJobHandle): Promise<void> {
    const logMessage = `Job ${job.id} has failed with reason: ${job.failedReason}`;
    this.logger.error(logMessage);
    this.logger.error(job.stacktrace);
    if (typeof job.log === 'function') void job.log(logMessage);

    try {
      await this.dlqService.addFailedJobToDLQ({
        originalQueueName: QueueName.CRON,
        originalJobId: job.id ?? '',
        originalJobName: job.name,
        originalJobData: job.data,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        timestamp: Date.now(),
      });
    } catch (error) {
      // A rejection from an event handler has no caller: unhandled, it ended the worker process over a failure to file a failure.
      this.logger.error(
        `Could not file failed job ${job.id} in the dead-letter queue: ${(error as Error).message}`
      );
    }
  }

  /**
   * BullMQ emits `(jobId, previousState)` here, not the job. A stalled job is either re-queued (the worker that held its lock
   * died) or, past `maxStalledCount`, failed, which the `failed` handler already forwards to the dead-letter queue, so this only
   * logs: writing it to the DLQ as well filed a job that was about to be retried, with an empty id, name and payload.
   */
  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.error(`Job ${jobId} has been stalled`);
  }

  /** Worker-level errors (a lost Redis connection) carry no job: BullMQ emits `(error)` only. */
  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error(`Worker error: ${error.message}`);
  }
}
