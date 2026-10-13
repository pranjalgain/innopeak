import { CronJobName, QueueName } from '@bg/constants/job.constant';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CronQueue {
  private readonly logger = new Logger(CronQueue.name);
  constructor(private readonly queuePublisher: QueuePublisherProvider) {}

  async addDailyMailJob(data?: Record<string, unknown>): Promise<void> {
    await this.addCronJob(CronJobName.DAILY_MAIL, data);
  }

  async addAuthTokenCleanupJob(): Promise<void> {
    await this.addCronJob(CronJobName.AUTH_TOKEN_CLEANUP);
  }

  async addReviewSyncPollJob(): Promise<void> {
    await this.addCronJob(CronJobName.REVIEW_SYNC_POLL);
  }

  async addReviewerRetentionPurgeJob(): Promise<void> {
    await this.addCronJob(CronJobName.REVIEWER_RETENTION_PURGE);
  }

  async addErasurePurgeJob(): Promise<void> {
    await this.addCronJob(CronJobName.ERASURE_PURGE);
  }

  async addBillingReconciliationSweepJob(): Promise<void> {
    await this.addCronJob(CronJobName.BILLING_RECONCILIATION_SWEEP);
  }

  /**
   * Every worker replica runs the same `@Cron` schedule, so N replicas would enqueue N copies of each tick (N polls of every
   * location against Google's quota every 15 minutes). The id is the job name plus the minute the tick fired in: replicas ticking in
   * the same minute produce the same id, and BullMQ keeps one job.
   */
  private async addCronJob(jobName: CronJobName, data?: Record<string, unknown>): Promise<void> {
    const minuteBucket = Math.floor(Date.now() / 60_000);
    await this.queuePublisher.publish(
      QueueName.CRON,
      jobName,
      { jobType: jobName, data },
      { jobId: `${jobName}-${minuteBucket}` }
    );
    this.logger.debug(`Added ${jobName} job`);
  }
}
