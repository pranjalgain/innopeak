import { JobName, QueueName } from '@bg/constants/job.constant';
import type { IEmailJob, IOtpEmailJob } from '@bg/interfaces/job.interface';
import type { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { Job } from 'bullmq';

import type { EmailQueueService } from './email-queue.service';
import { EmailProcessor } from './email.processor';

type EmailJobHandle = Job<IEmailJob, void, JobName>;

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let emailQueueService: jest.Mocked<EmailQueueService>;
  let dlqService: jest.Mocked<DeadLetterQueueService>;

  const otpData: IOtpEmailJob = {
    email: 'user@example.com',
    customerName: 'Jane',
    otp: '123456',
  };

  const buildJob = (overrides: Record<string, unknown> = {}): EmailJobHandle =>
    ({
      id: 'job-1',
      name: JobName.OTP_EMAIL_VERIFICATION,
      data: otpData,
      progress: 0,
      failedReason: undefined,
      stacktrace: [],
      attemptsMade: 1,
      opts: { attempts: 1 },
      log: jest.fn().mockResolvedValue(1),
      updateData: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    }) as unknown as EmailJobHandle;

  beforeEach(() => {
    emailQueueService = {
      sendOtpEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailQueueService>;
    dlqService = {
      addFailedJobToDLQ: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DeadLetterQueueService>;
    processor = new EmailProcessor(emailQueueService, dlqService);
    // `WorkerHost.worker` throws until Nest attaches one; the stalled lookup only passes it to `Job.fromId`, which tests stub.
    Object.defineProperty(processor, 'worker', { value: {} });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('process', () => {
    it('dispatches OTP_EMAIL_VERIFICATION jobs to EmailQueueService.sendOtpEmail', async () => {
      const job = buildJob();

      await processor.process(job);

      expect(emailQueueService.sendOtpEmail).toHaveBeenCalledWith(otpData);
      expect(job.log).toHaveBeenCalled();
    });

    it('dispatches LOCATIONS_PAUSED_EMAIL jobs to EmailQueueService.sendLocationsPausedEmail', async () => {
      emailQueueService.sendLocationsPausedEmail = jest.fn().mockResolvedValue(undefined);
      const data = { email: 'owner@example.com', locale: 'en' };
      const job = buildJob({ name: JobName.LOCATIONS_PAUSED_EMAIL, data });

      await processor.process(job);

      expect(emailQueueService.sendLocationsPausedEmail).toHaveBeenCalledWith(data);
    });

    it('throws for an unknown job name without calling the email queue service', async () => {
      const job = buildJob({ name: 'unknown-job' });

      await expect(processor.process(job)).rejects.toThrow('Unknown job name: unknown-job');
      expect(emailQueueService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('logs and rethrows when EmailQueueService.sendOtpEmail rejects', async () => {
      const job = buildJob();
      const error = new Error('smtp down');
      emailQueueService.sendOtpEmail.mockRejectedValue(error);

      await expect(processor.process(job)).rejects.toThrow(error);
      expect(job.log).toHaveBeenCalledWith(expect.stringContaining('Failed to process job'));
    });
  });

  describe('onActive', () => {
    it('logs that the job is now active', () => {
      const job = buildJob();

      processor.onActive(job);

      expect(job.log).toHaveBeenCalledWith(expect.stringContaining('is now active'));
    });
  });

  describe('onProgress', () => {
    it('logs the current progress percentage', () => {
      const job = buildJob({ progress: 50 });

      processor.onProgress(job);

      expect(job.log).toHaveBeenCalledWith(expect.stringContaining('50'));
    });
  });

  describe('onCompleted', () => {
    it('logs that the job has completed', async () => {
      const job = buildJob();

      await processor.onCompleted(job);

      expect(job.log).toHaveBeenCalledWith(expect.stringContaining('has been completed'));
    });

    // The job outlives the send (a day in Redis and Bull Board) and an invite link is valid for days.
    it.each([
      ['an OTP', otpData, { email: 'user@example.com', customerName: 'Jane', otp: '[redacted]' }],
      [
        'an invite link',
        {
          email: 'invitee@example.com',
          inviteLink: 'https://app.example.com/invite/abc',
          businessName: 'Cafe',
        },
        { email: 'invitee@example.com', inviteLink: '[redacted]', businessName: 'Cafe' },
      ],
    ])('redacts %s in the stored payload once the email is sent', async (_name, data, expected) => {
      const job = buildJob({ data });

      await processor.onCompleted(job);

      expect(job.updateData).toHaveBeenCalledWith(expected);
    });

    it('does not fail a sent email when the redaction cannot be written', async () => {
      const job = buildJob({ updateData: jest.fn().mockRejectedValue(new Error('redis down')) });

      await expect(processor.onCompleted(job)).resolves.toBeUndefined();
    });
  });

  describe('onFailed', () => {
    it('logs the failure and pushes the job to the DLQ', async () => {
      const job = buildJob({ failedReason: 'boom', stacktrace: ['at x'] });

      await processor.onFailed(job);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith({
        originalQueueName: QueueName.EMAIL,
        originalJobId: job.id,
        originalJobName: job.name,
        originalJobData: job.data,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        timestamp: expect.any(Number),
      });
    });

    it('does not reject when the dead-letter write fails', async () => {
      dlqService.addFailedJobToDLQ.mockRejectedValue(new Error('redis down'));
      const job = buildJob({ attemptsMade: 3, opts: { attempts: 3 } });

      await expect(processor.onFailed(job)).resolves.toBeUndefined();
    });

    it('defaults originalJobId to an empty string when job.id is missing', async () => {
      const job = buildJob({ id: undefined });

      await processor.onFailed(job);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({ originalJobId: '' })
      );
    });

    /**
     * Guards: BullMQ fires `failed` after every attempt, so a job that fails once but later succeeds must
     * not land in the DLQ.
     */
    it('does not push to the DLQ when more retry attempts remain', async () => {
      const job = buildJob({ attemptsMade: 1, opts: { attempts: 3 } });

      await processor.onFailed(job);

      expect(dlqService.addFailedJobToDLQ).not.toHaveBeenCalled();
      // The retry still has to send the real code, so the payload must stay intact until the last attempt.
      expect(job.updateData).not.toHaveBeenCalled();
    });

    it('pushes to the DLQ once the final retry attempt is exhausted', async () => {
      const job = buildJob({ attemptsMade: 3, opts: { attempts: 3 } });

      await processor.onFailed(job);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledTimes(1);
    });

    it('redacts the stored payload once no attempts remain, after the dead-letter copy is taken', async () => {
      const job = buildJob({ attemptsMade: 3, opts: { attempts: 3 } });

      await processor.onFailed(job);

      expect(job.updateData).toHaveBeenCalledWith({
        email: 'user@example.com',
        customerName: 'Jane',
        otp: '[redacted]',
      });
      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({ originalJobData: otpData })
      );
    });

    it('treats a missing opts.attempts as a single-attempt job (terminal on first failure)', async () => {
      const job = buildJob({ attemptsMade: 1, opts: {} });

      await processor.onFailed(job);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledTimes(1);
    });
  });

  describe('onStalled', () => {
    // BullMQ emits `(jobId, previousState)`. A job failed past `maxStalledCount` gets no `failed` event at all.
    const withWorkerHolding = (job: unknown): jest.SpyInstance =>
      jest.spyOn(Job, 'fromId').mockResolvedValue(job as never);

    it('leaves a stalled job that was re-queued alone: it is about to be retried', async () => {
      const job = buildJob({ isFailed: jest.fn().mockResolvedValue(false) });
      withWorkerHolding(job);

      await processor.onStalled('job-123');

      expect(dlqService.addFailedJobToDLQ).not.toHaveBeenCalled();
      expect(job.updateData).not.toHaveBeenCalled();
    });

    it('files a job the stall detector failed in the dead-letter queue and redacts its stored payload', async () => {
      const job = buildJob({
        failedReason: 'job stalled more than allowable limit',
        isFailed: jest.fn().mockResolvedValue(true),
      });
      withWorkerHolding(job);

      await processor.onStalled('job-123');

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({
          originalJobId: 'job-1',
          failedReason: 'job stalled more than allowable limit',
        })
      );
      expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ otp: '[redacted]' }));
    });

    it('does nothing for a job that is already gone, and never throws', async () => {
      withWorkerHolding(undefined);
      await expect(processor.onStalled('job-123')).resolves.toBeUndefined();

      jest.spyOn(Job, 'fromId').mockRejectedValue(new Error('redis down'));
      await expect(processor.onStalled('job-123')).resolves.toBeUndefined();
      expect(dlqService.addFailedJobToDLQ).not.toHaveBeenCalled();
    });
  });

  describe('onError', () => {
    // BullMQ emits the bare `Error` for worker-level failures such as a lost Redis connection.
    it('logs a worker error without throwing', () => {
      expect(() => {
        processor.onError(new Error('worker exploded'));
      }).not.toThrow();
    });
  });
});
