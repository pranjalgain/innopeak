import { DEFAULT_JOB_OPTIONS, JobName, QueueName } from '@bg/constants/job.constant';
import {
  IAdminInviteEmailJob,
  IErasureNoticeEmailJob,
  IErasurePurgeAlertEmailJob,
  ILocationsPausedEmailJob,
  IMemberInviteEmailJob,
  IOtpEmailJob,
} from '@bg/interfaces/job.interface';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { withTimeout } from '@common/helpers/with-timeout';
import { Injectable, Logger } from '@nestjs/common';

/**
 * The producer's Redis connection waits indefinitely for a dead server (BullMQ needs that), so an unbounded `add` turned a Redis outage into
 * requests that never answered: a sign-up, a code resend or an invite now waits on its email job. Long enough for a slow but healthy queue.
 */
export const QUEUE_PUBLISH_TIMEOUT_MS = 5_000;

@Injectable()
export class AddingJobsToQueueManager {
  private readonly logger = new Logger(AddingJobsToQueueManager.name);
  constructor(private readonly queuePublisher: QueuePublisherProvider) {}

  async addJob<T>(queueName: QueueName, jobName: JobName, data: T): Promise<void> {
    // Never serialize the payload: OTP-email jobs carry the raw `otp` and set/reset links, and a
    // staging box logs at `debug` (NODE_ENV is only development/production). Log only the routing.
    this.logger.debug(`Adding job ${jobName} to queue ${queueName}`, 'AddingJobsToQueueManager');

    try {
      // A timeout rejects like any other failure, so the callers' "not queued" handling (a 503, a released resend cooldown, a revoked
      // invite) applies to an outage too. The add itself is not cancelled and may still land once Redis returns.
      await withTimeout(
        this.queuePublisher.publish(queueName, jobName, data, {
          attempts: DEFAULT_JOB_OPTIONS.attempts,
          backoffDelayMs: DEFAULT_JOB_OPTIONS.backoff.delay,
        }),
        QUEUE_PUBLISH_TIMEOUT_MS,
        `queueing ${jobName}`
      );
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

  async addMemberInviteEmailJob(jobName: JobName, data: IMemberInviteEmailJob): Promise<void> {
    return this.addJob(QueueName.EMAIL, jobName, data);
  }

  async addErasureNoticeEmailJob(jobName: JobName, data: IErasureNoticeEmailJob): Promise<void> {
    return this.addJob(QueueName.EMAIL, jobName, data);
  }

  async addErasurePurgeAlertEmailJob(
    jobName: JobName,
    data: IErasurePurgeAlertEmailJob
  ): Promise<void> {
    return this.addJob(QueueName.EMAIL, jobName, data);
  }

  async addLocationsPausedEmailJob(data: ILocationsPausedEmailJob): Promise<void> {
    return this.addJob(QueueName.EMAIL, JobName.LOCATIONS_PAUSED_EMAIL, data);
  }

  async addAdminSetPasswordOtpEmailJob(jobName: JobName, data: IOtpEmailJob): Promise<void> {
    return this.addJob(QueueName.EMAIL, jobName, data);
  }
}
