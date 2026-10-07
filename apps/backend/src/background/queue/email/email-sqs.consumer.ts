import { JobName, QueueName } from '@bg/constants/job.constant';
import {
  IAdminInviteEmailJob,
  IErasureNoticeEmailJob,
  IErasurePurgeAlertEmailJob,
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
   * Must stay in step with `EmailProcessor`'s switch: it is the same queue over two transports (BullMQ
   * locally, SQS on `aws`), so a job name handled in only one fails hard in the other (an unhandled
   * `admin-invite-email` would go straight to the DLQ).
   */
  protected async process(jobName: string, data: unknown): Promise<void> {
    switch (jobName as JobName) {
      case JobName.OTP_EMAIL_VERIFICATION:
      case JobName.ADMIN_SET_PASSWORD_OTP_EMAIL:
        await this.emailQueueService.sendOtpEmail(data as IOtpEmailJob);
        break;
      case JobName.ADMIN_INVITE_EMAIL:
        await this.emailQueueService.sendAdminInviteEmail(data as IAdminInviteEmailJob);
        break;
      case JobName.MEMBER_INVITE_EMAIL:
        await this.emailQueueService.sendMemberInviteEmail(data as IMemberInviteEmailJob);
        break;
      case JobName.ERASURE_NOTICE_EMAIL:
        await this.emailQueueService.sendErasureNoticeEmail(data as IErasureNoticeEmailJob);
        break;
      case JobName.ERASURE_PURGE_ALERT_EMAIL:
        await this.emailQueueService.sendErasurePurgeAlertEmail(data as IErasurePurgeAlertEmailJob);
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
