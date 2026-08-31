import { JobName, QueueName } from '@bg/constants/job.constant';
import { IOtpEmailJob } from '@bg/interfaces/job.interface';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailQueue {
  private readonly logger = new Logger(EmailQueue.name);

  constructor(private readonly queuePublisher: QueuePublisherProvider) {}

  async addOTPEmailJob(data: IOtpEmailJob): Promise<void> {
    this.logger.debug(`Adding otp email job for ${data.email}`);
    await this.queuePublisher.publish(QueueName.EMAIL, JobName.OTP_EMAIL_VERIFICATION, data);
  }
}
