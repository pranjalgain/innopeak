import { JobName, QueueName } from '@bg/constants/job.constant';
import { redactJobSecrets } from '@bg/helpers/redact-job-secrets.util';
import { IDLQFailedJobData } from '@bg/interfaces/job.interface';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DeadLetterQueueService {
  private readonly logger = new Logger(DeadLetterQueueService.name);

  constructor(private readonly queuePublisher: QueuePublisherProvider) {}

  /**
   * `redactJobSecrets` strips any live, usable credential (`otp`, `inviteLink`, …) before this
   * ever reaches the queue — a failed job would otherwise sit in the DLQ (days-long retention)
   * holding it in the clear. See that helper's own comment.
   */
  async addFailedJobToDLQ(data: IDLQFailedJobData): Promise<void> {
    this.logger.warn(
      `Adding failed job to DLQ: ${data.originalJobId} from ${data.originalQueueName}`
    );
    await this.queuePublisher.publish(QueueName.DEAD_LETTER, JobName.DLQ_FAILED_JOB, {
      ...data,
      originalJobData: redactJobSecrets(data.originalJobData),
    });
  }
}
