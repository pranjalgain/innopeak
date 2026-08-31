import { JobName, QueueName } from '@bg/constants/job.constant';
import { IOtpEmailJob } from '@bg/interfaces/job.interface';
import { SqsQueueConsumerBase } from '@bg/providers/sqs-queue-consumer.base';
import { EnvConfig } from '@config/env.config';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { EmailQueueService } from '@email-queue/email-queue.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailSqsConsumer extends SqsQueueConsumerBase {
  protected readonly queueName = QueueName.EMAIL;
  protected readonly logger = new Logger(EmailSqsConsumer.name);

  constructor(
    configService: ConfigService<EnvConfig>,
    private readonly emailQueueService: EmailQueueService,
    private readonly dlqService: DeadLetterQueueService
  ) {
    super(configService);
  }

  protected async process(jobName: string, data: unknown): Promise<void> {
    switch (jobName as JobName) {
      case JobName.OTP_EMAIL_VERIFICATION:
        await this.emailQueueService.sendOtpEmail(data as IOtpEmailJob);
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
      originalQueueName: QueueName.EMAIL,
      originalJobId: '',
      originalJobName: jobName,
      originalJobData: data,
      failedReason: error.message,
      stacktrace: error.stack ? error.stack.split('\n') : [],
      timestamp: Date.now(),
    });
  }
}
