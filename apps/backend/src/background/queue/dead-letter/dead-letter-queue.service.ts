import { JobName, QueueName } from '@bg/constants/job.constant';
import { IDLQFailedJobData } from '@bg/interfaces/job.interface';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DeadLetterQueueService {
  private readonly logger = new Logger(DeadLetterQueueService.name);

  constructor(private readonly queuePublisher: QueuePublisherProvider) {}

  async addFailedJobToDLQ(data: IDLQFailedJobData): Promise<void> {
    this.logger.warn(
      `Adding failed job to DLQ: ${data.originalJobId} from ${data.originalQueueName}`
    );
    await this.queuePublisher.publish(QueueName.DEAD_LETTER, JobName.DLQ_FAILED_JOB, {
      ...data,
      originalJobData: this.redactSecrets(data.originalJobData),
    });
  }

  /**
   * `IOtpEmailJob.otp` is a live, usable credential — a failed OTP email job otherwise sat in the
   * DLQ (days-long retention) holding the plaintext code. Structural, not name-specific: any job
   * payload carrying an `otp` field has it redacted before this ever reaches the queue.
   */
  private redactSecrets(jobData: unknown): unknown {
    if (
      typeof jobData === 'object' &&
      jobData !== null &&
      'otp' in jobData &&
      typeof jobData.otp === 'string'
    ) {
      return { ...jobData, otp: '[redacted]' };
    }
    return jobData;
  }
}
