import { JobName, QueueName } from '@bg/constants/job.constant';
import {
  IAdminInviteEmailJob,
  IMemberInviteEmailJob,
  IOtpEmailJob,
} from '@bg/interfaces/job.interface';
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

  /**
   * Must stay in step with `EmailProcessor`'s own switch — the two are the same queue under two
   * transports (BullMQ locally, SQS on `aws`), so a job name handled in only one of them fails
   * hard in the other. That is exactly what happened to `CronSqsConsumer` before the audit;
   * `admin-invite-email` is the case that would otherwise have gone straight to the DLQ in `aws`
   * mode, silently dropping every platform-admin invite email.
   */
  protected async process(jobName: string, data: unknown): Promise<void> {
    switch (jobName as JobName) {
      case JobName.OTP_EMAIL_VERIFICATION:
        await this.emailQueueService.sendOtpEmail(data as IOtpEmailJob);
        break;
      case JobName.ADMIN_INVITE_EMAIL:
        await this.emailQueueService.sendAdminInviteEmail(data as IAdminInviteEmailJob);
        break;
      case JobName.MEMBER_INVITE_EMAIL:
        await this.emailQueueService.sendMemberInviteEmail(data as IMemberInviteEmailJob);
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
