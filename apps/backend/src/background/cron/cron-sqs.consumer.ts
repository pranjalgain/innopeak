import { CronJobName, QueueName } from '@bg/constants/job.constant';
import { ICronJob } from '@bg/interfaces/job.interface';
import { SqsQueueConsumerBase } from '@bg/providers/sqs-queue-consumer.base';
import { EnvConfig } from '@config/env.config';
import { CronService } from '@cron/cron.service';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CronSqsConsumer extends SqsQueueConsumerBase {
  protected readonly queueName = QueueName.CRON;
  protected readonly logger = new Logger(CronSqsConsumer.name);

  constructor(
    configService: ConfigService<EnvConfig>,
    private readonly cronService: CronService,
    private readonly dlqService: DeadLetterQueueService
  ) {
    super(configService);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async process(jobName: string, data: unknown): Promise<void> {
    switch (jobName as CronJobName) {
      // CronJobName currently has a single member so this comparison is trivially true today,
      // but the switch/default combo is kept so adding future CronJobName values fails safe.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      case CronJobName.DAILY_MAIL:
        this.cronService.sendDailyMail((data as ICronJob | undefined) ?? undefined);
        break;
      default:
        throw new Error(`Unknown job name: ${jobName}`);
    }
  }

  protected override async onProcessingFailed(
    jobName: string,
    data: unknown,
    error: Error
  ): Promise<void> {
    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.CRON,
      originalJobId: '',
      originalJobName: jobName,
      originalJobData: data,
      failedReason: error.message,
      stacktrace: error.stack ? error.stack.split('\n') : [],
      timestamp: Date.now(),
    });
  }
}
