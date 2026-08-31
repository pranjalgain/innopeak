import { DEFAULT_JOB_OPTIONS, JobName, QueueName } from '@bg/constants/job.constant';
import {
  INotificationJob,
  INotificationTopicJob,
  IOtpEmailJob,
  ISendNotificationJob,
} from '@bg/interfaces/job.interface';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AddingJobsToQueueManager {
  private readonly logger = new Logger(AddingJobsToQueueManager.name);
  constructor(private readonly queuePublisher: QueuePublisherProvider) {}

  async addJob<T>(queueName: QueueName, jobName: JobName, data: T): Promise<void> {
    this.logger.debug(
      `Adding job ${jobName} to queue ${queueName} with data: ${JSON.stringify(data)}`,
      'AddingJobsToQueueManager'
    );

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

  async addSendNotificationToDeviceJob(jobName: JobName, data: INotificationJob): Promise<void> {
    return this.addJob(QueueName.NOTIFICATION, jobName, data);
  }

  async addSendNotificationToTopicJob(
    jobName: JobName,
    data: INotificationTopicJob
  ): Promise<void> {
    return this.addJob(QueueName.NOTIFICATION, jobName, data);
  }

  async addSendNotificationJob(jobName: JobName, data: ISendNotificationJob): Promise<void> {
    return this.addJob(QueueName.NOTIFICATION, jobName, data);
  }

  async addRegisterationOtpEmailJob(jobName: JobName, data: IOtpEmailJob): Promise<void> {
    return this.addJob(QueueName.EMAIL, jobName, data);
  }

  async addForgotPasswordEmailJob(jobName: JobName, data: IOtpEmailJob): Promise<void> {
    return this.addJob(QueueName.EMAIL, jobName, data);
  }
}
