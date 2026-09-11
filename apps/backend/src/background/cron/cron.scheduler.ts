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

  /**
   * PLAN.md §4.1's 15-minute poll. A raw expression, not a `CronExpression` member — this
   * library's enum has no 15-minute constant (confirmed against the installed
   * `@nestjs/schedule` package; the closest are `EVERY_10_MINUTES`/`EVERY_30_MINUTES`). Six
   * fields, seconds-first, matching every other entry in that enum (each starts with a literal
   * `0` seconds field) — a five-field unix-cron expression would be silently misread here.
   */
  @Cron('0 */15 * * * *')
  async scheduleReviewSyncPoll(): Promise<void> {
    this.logger.debug('Scheduling review sync poll job');
    await this.cronQueue.addReviewSyncPollJob();
  }

  /**
   * `PLAN.md` §6's nightly reviewer-retention purge. Off both the midnight and 3am slots, same
   * reasoning as `scheduleAuthTokenCleanup` — three daily jobs sharing one worker tick would be
   * needless contention for no benefit.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduleReviewerRetentionPurge(): Promise<void> {
    this.logger.debug('Scheduling reviewer retention purge job');
    await this.cronQueue.addReviewerRetentionPurgeJob();
  }
}
