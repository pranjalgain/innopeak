import { JobName, QueueName } from '@bg/constants/job.constant';
import { redactJobSecrets } from '@bg/helpers/redact-job-secrets.util';
import {
  IAdminInviteEmailJob,
  IEmailJob,
  IMemberInviteEmailJob,
  IOtpEmailJob,
} from '@bg/interfaces/job.interface';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { EmailQueueService } from '@email-queue/email-queue.service';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor(QueueName.EMAIL, {
  concurrency: 3,
  drainDelay: 300,
  stalledInterval: 300000, // 5 minutes
  maxStalledCount: 3,
  limiter: {
    max: 10,
    duration: 150,
  },
})
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);
  constructor(
    private readonly emailQueueService: EmailQueueService,
    private readonly dlqService: DeadLetterQueueService
  ) {
    super();
  }
  async process(job: Job<IEmailJob, void, JobName>, _token?: string): Promise<void> {
    // `redactJobSecrets` — never JSON.stringify(job.data) raw here. See that helper's own comment:
    // this exact line previously shipped live OTPs into log files and Loki whenever debug logging
    // was enabled, and an admin invite link would be the same kind of leak.
    let logString_ = `Processing job ${job.id} of type ${job.name} with data ${JSON.stringify(redactJobSecrets(job.data))}...`;
    this.logger.debug(logString_, 'EmailProcessor');
    if (typeof job.log === 'function') void job.log(logString_);

    try {
      switch (job.name) {
        case JobName.OTP_EMAIL_VERIFICATION:
        case JobName.ADMIN_SET_PASSWORD_OTP_EMAIL:
          await this.emailQueueService.sendOtpEmail(job.data as unknown as IOtpEmailJob);
          break;
        case JobName.ADMIN_INVITE_EMAIL:
          await this.emailQueueService.sendAdminInviteEmail(
            job.data as unknown as IAdminInviteEmailJob
          );
          break;
        case JobName.MEMBER_INVITE_EMAIL:
          await this.emailQueueService.sendMemberInviteEmail(
            job.data as unknown as IMemberInviteEmailJob
          );
          break;
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }

      logString_ = `Completed job ${job.id} of type ${job.name}`;
      this.logger.debug(logString_, 'EmailProcessor');
      if (typeof job.log === 'function') void job.log(logString_);
    } catch (error) {
      logString_ = `Failed to process job ${job.id} of type ${job.name} with error ${(error as Error).message}`;
      this.logger.error(logString_, (error as Error).stack, 'EmailProcessor');
      if (typeof job.log === 'function') void job.log(logString_);
      throw error;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job<IEmailJob, void, JobName>): void {
    this.logger.debug(`Job ${job.id} is now active`);
    if (typeof job.log === 'function') void job.log(`Job ${job.id} is now active`);
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job<IEmailJob, void, JobName>): void {
    this.logger.debug(`Job ${job.id} is ${JSON.stringify(job.progress)}% complete`);
    if (typeof job.log === 'function')
      void job.log(`Job ${job.id} is ${JSON.stringify(job.progress)}% complete`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<IEmailJob, void, JobName>): void {
    this.logger.debug(`Job ${job.id} has been completed`);
    if (typeof job.log === 'function') void job.log(`Job ${job.id} has been completed`);
  }

  /**
   * BullMQ fires `failed` after *every* failed attempt, not only the last one — so a job that
   * fails once and then succeeds on retry used to land in the DLQ anyway, even though nothing
   * ultimately failed. The DLQ never replays, so that corrupted the signal (a "failure" that
   * later self-healed) rather than causing any double-processing. Only forward it once BullMQ
   * itself has given up — `attemptsMade` has reached `opts.attempts` (default 1 if unset).
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<IEmailJob, void, JobName>): Promise<void> {
    const logString_ = `Job ${job.id} has failed with reason: ${job.failedReason}`;
    this.logger.error(logString_);
    this.logger.error(job.stacktrace);
    if (typeof job.log === 'function') void job.log(logString_);

    if (job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }

    // Push the failed job to the Dead Letter Queue
    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.EMAIL,
      originalJobId: job.id ?? '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      timestamp: Date.now(),
    });
  }

  @OnWorkerEvent('stalled')
  async onStalled(job: Job<IEmailJob, void, JobName>): Promise<void> {
    this.logger.error(`Job ${job.id} has been stalled`);
    if (typeof job.log === 'function') void job.log(`Job ${job.id} has been stalled`);

    // Considering stalled jobs to DLQ if they are consistently stalling
    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.EMAIL,
      originalJobId: job.id ?? '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: `Job stalled for too long. Current attempts: ${job.attemptsMade}`,
      timestamp: Date.now(),
    });
  }

  @OnWorkerEvent('error')
  async onError(job: Job<IEmailJob, void, JobName>, error: Error): Promise<void> {
    const logString_ = `Job ${job.id} has failed with worker error: ${error.message}`;
    this.logger.error(logString_);
    if (typeof job.log === 'function') void job.log(logString_);

    // Errors to DLQ as well
    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.EMAIL,
      originalJobId: job.id ?? '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: `Processor error: ${error.message}`,
      stacktrace: error.stack ? error.stack.split('\n') : [],
      timestamp: Date.now(),
    });
  }
}
