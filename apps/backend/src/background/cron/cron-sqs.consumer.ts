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

  async process(jobName: string, data: unknown): Promise<void> {
    // Held in a variable so the compiler can narrow it to `never` in `default`; a repeated cast can't.
    const name = jobName as CronJobName;

    switch (name) {
      case CronJobName.DAILY_MAIL:
        this.cronService.sendDailyMail((data as ICronJob | undefined) ?? undefined);
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
        const unhandled: never = name;
        throw new Error(`Unknown job name: ${String(unhandled)}`);
      }
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
