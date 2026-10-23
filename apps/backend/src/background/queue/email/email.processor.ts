import { JobName, QueueName } from '@bg/constants/job.constant';
import { redactJobSecrets } from '@bg/helpers/redact-job-secrets.util';
import {
  IAdminInviteEmailJob,
  IEmailJob,
  IErasureNoticeEmailJob,
  IErasurePurgeAlertEmailJob,
  ILocationsPausedEmailJob,
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
    // Use `redactJobSecrets`, never a raw JSON.stringify(job.data): it leaks OTPs and invite links into logs.
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
        case JobName.ERASURE_NOTICE_EMAIL:
          await this.emailQueueService.sendErasureNoticeEmail(
            job.data as unknown as IErasureNoticeEmailJob
          );
          break;
        case JobName.LOCATIONS_PAUSED_EMAIL:
          await this.emailQueueService.sendLocationsPausedEmail(
            job.data as unknown as ILocationsPausedEmailJob
          );
          break;
        case JobName.ERASURE_PURGE_ALERT_EMAIL:
          await this.emailQueueService.sendErasurePurgeAlertEmail(
            job.data as unknown as IErasurePurgeAlertEmailJob
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
  async onCompleted(job: Job<IEmailJob, void, JobName>): Promise<void> {
    this.logger.debug(`Job ${job.id} has been completed`);
    if (typeof job.log === 'function') void job.log(`Job ${job.id} has been completed`);
    await this.scrubSecrets(job);
  }

  /**
   * The mail is sent, so the credential in the payload has done its job; the job itself stays in Redis (and in Bull Board) for a day,
   * and an invite link is valid for days. Redacts what is stored rather than dropping the job so the history stays readable. Never
   * throws: a scrub that fails must not turn a sent email into a failed job.
   */
  private async scrubSecrets(job: Job<IEmailJob, void, JobName>): Promise<void> {
    try {
      await job.updateData(redactJobSecrets(job.data) as IEmailJob);
    } catch (error) {
      this.logger.warn(
        `Could not redact the stored payload of job ${job.id}: ${(error as Error).message}`
      );
    }
  }

  /**
   * BullMQ fires `failed` after every attempt, so forward to the DLQ only once `attemptsMade` reaches
   * `opts.attempts` (default 1); otherwise retries that self-heal pollute it (it never replays).
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

    try {
      await this.retireFailedJob(job);
    } catch (error) {
      // A rejection from an event handler has no caller: unhandled, it ended the worker process over a failure to file a failure.
      this.logger.error(`Could not retire failed job ${job.id}: ${(error as Error).message}`);
    }
  }

  /** Out of attempts: keep a (redacted) dead-letter copy, then scrub the credential from the stored job. */
  private async retireFailedJob(job: Job<IEmailJob, void, JobName>): Promise<void> {
    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.EMAIL,
      originalJobId: job.id ?? '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      timestamp: Date.now(),
    });
    // Nothing will read the credential again; the dead-letter copy was already redacted on the way in.
    await this.scrubSecrets(job);
  }

  /**
   * BullMQ emits `(jobId, previousState)` here, not the job. A stalled job is either re-queued (the worker that held its lock
   * died), which needs nothing, or, past `maxStalledCount`, moved to `failed` *without* a `failed` event, so neither the
   * dead-letter copy nor the scrub in `onFailed` would ever run and the raw OTP or invite link would sit in Redis. Looked up by id
   * (the event carries no job) and retired only when it really is failed: filing a job that is about to be retried would put an
   * unfinished one in the dead-letter queue.
   */
  @OnWorkerEvent('stalled')
  async onStalled(jobId: string): Promise<void> {
    this.logger.error(`Job ${jobId} has been stalled`);
    try {
      const job = await Job.fromId<IEmailJob, void, JobName>(this.worker, jobId);
      if (job && (await job.isFailed())) {
        await this.retireFailedJob(job);
      }
    } catch (error) {
      this.logger.error(`Could not retire stalled job ${jobId}: ${(error as Error).message}`);
    }
  }

  /** Worker-level errors (a lost Redis connection) carry no job: BullMQ emits `(error)` only. */
  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error(`Worker error: ${error.message}`);
  }
}
