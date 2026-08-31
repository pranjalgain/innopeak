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

  private async addCronJob(jobName: CronJobName, data?: Record<string, unknown>): Promise<void> {
    await this.queuePublisher.publish(QueueName.CRON, jobName, { jobType: jobName, data });
    this.logger.debug(`Added ${jobName} job`);
  }
}
