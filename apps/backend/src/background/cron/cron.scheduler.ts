import { CronQueue } from '@cron/cron.queue';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CronScheduler implements OnModuleInit {
  private readonly logger = new Logger(CronScheduler.name);

  constructor(private readonly cronQueue: CronQueue) {}

  onModuleInit(): void {
    this.logger.debug('CronScheduler initialized');
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scheduleDailyCleanup(): Promise<void> {
    this.logger.debug('Scheduling daily mail job');
    await this.cronQueue.addDailyMailJob();
  }

  /** Off the midnight slot so the two daily jobs never contend for the same worker tick. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduleAuthTokenCleanup(): Promise<void> {
    this.logger.debug('Scheduling auth token cleanup job');
    await this.cronQueue.addAuthTokenCleanupJob();
  }

  /** Half past 3: after the auth-token cleanup, so the two housekeeping jobs never start on the same tick. */
  @Cron('0 30 3 * * *')
  async scheduleNotificationRetentionPurge(): Promise<void> {
    this.logger.debug('Scheduling notification retention purge job');
    await this.cronQueue.addNotificationRetentionPurgeJob();
  }

  /** `CronExpression` has no 15-minute member. Six fields, seconds first: a five-field expression would be misread. */
  @Cron('0 */15 * * * *')
  async scheduleReviewSyncPoll(): Promise<void> {
    this.logger.debug('Scheduling review sync poll job');
    await this.cronQueue.addReviewSyncPollJob();
  }

  /** Own slot, off midnight and 3am, to avoid contending for the same worker tick. */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduleReviewerRetentionPurge(): Promise<void> {
    this.logger.debug('Scheduling reviewer retention purge job');
    await this.cronQueue.addReviewerRetentionPurgeJob();
  }

  /** Own slot, off every other daily job. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async scheduleErasurePurge(): Promise<void> {
    this.logger.debug('Scheduling erasure purge job');
    await this.cronQueue.addErasurePurgeJob();
  }

  /** Safety net for a Stripe webhook missed past its retry window; daily is enough since the checkout-redirect reconcile covers the common case. Own slot. */
  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async scheduleBillingReconciliationSweep(): Promise<void> {
    this.logger.debug('Scheduling billing reconciliation sweep job');
    await this.cronQueue.addBillingReconciliationSweepJob();
  }
}
