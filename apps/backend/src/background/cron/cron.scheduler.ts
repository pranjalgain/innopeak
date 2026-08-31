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
}
