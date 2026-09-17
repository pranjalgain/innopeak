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
    // Narrowed once into a variable (rather than switching on the cast expression directly) so
    // the compiler can actually narrow it to `never` below — a cast repeated at each `case` isn't
    // narrowable, which silently defeats the exhaustiveness check.
    const name = jobName as CronJobName;

    switch (name) {
      case CronJobName.DAILY_MAIL:
        this.cronService.sendDailyMail((data as ICronJob | undefined) ?? undefined);
        break;
      case CronJobName.AUTH_TOKEN_CLEANUP:
        await this.cronService.purgeStaleAuthTokens();
        break;
      case CronJobName.REVIEW_SYNC_POLL:
        await this.cronService.pollDueLocations();
        break;
      case CronJobName.REVIEWER_RETENTION_PURGE:
        await this.cronService.purgeExpiredReviewerPii();
        break;
      default: {
        // Exhaustiveness check: a new CronJobName member left unhandled here fails the build.
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
