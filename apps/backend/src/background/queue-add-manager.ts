import { DEFAULT_JOB_OPTIONS, JobName, QueueName } from '@bg/constants/job.constant';
import { IAdminInviteEmailJob, IOtpEmailJob } from '@bg/interfaces/job.interface';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AddingJobsToQueueManager {
  private readonly logger = new Logger(AddingJobsToQueueManager.name);
  constructor(private readonly queuePublisher: QueuePublisherProvider) {}

  async addJob<T>(queueName: QueueName, jobName: JobName, data: T): Promise<void> {
    // Never serialize the payload — an OTP-email job carries the raw 6-digit `otp` (and, once the
    // reset flow lands, `passwordSetLink`/`passwordResetLink`). `NODE_ENV` only ever validates to
    // `development` or `production`, so a *staging* box logs at `debug`, and this line shipped
    // live OTPs into the log files and Loki. The HTTP interceptor already redacts these fields for
    // exactly this reason; this producer was the path that leaked around it. Log only the routing.
    this.logger.debug(`Adding job ${jobName} to queue ${queueName}`, 'AddingJobsToQueueManager');

    try {
      await this.queuePublisher.publish(queueName, jobName, data, {
        attempts: DEFAULT_JOB_OPTIONS.attempts,
        backoffDelayMs: DEFAULT_JOB_OPTIONS.backoff.delay,
      });
      this.logger.debug(`Job ${jobName} added successfully to queue ${queueName}`);
    } catch (error) {
      this.logger.error(
        `Error adding job ${jobName} to queue ${queueName}: ${(error as Error).message}`,
        (error as Error).stack,
        'AddingJobsToQueueManager'
      );
      throw error;
    }
  }

  async addRegisterationOtpEmailJob(jobName: JobName, data: IOtpEmailJob): Promise<void> {
    return this.addJob(QueueName.EMAIL, jobName, data);
  }

  async addForgotPasswordEmailJob(jobName: JobName, data: IOtpEmailJob): Promise<void> {
    return this.addJob(QueueName.EMAIL, jobName, data);
  }

  async addAdminInviteEmailJob(jobName: JobName, data: IAdminInviteEmailJob): Promise<void> {
    return this.addJob(QueueName.EMAIL, jobName, data);
  }
}
