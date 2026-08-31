import { JobName, QueueName } from '@bg/constants/job.constant';
import type { IEmailJob, IOtpEmailJob } from '@bg/interfaces/job.interface';
import type { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import type { Job } from 'bullmq';

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
    otp: 123456,
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
      log: jest.fn().mockResolvedValue(1),
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('dispatches OTP_EMAIL_VERIFICATION jobs to EmailQueueService.sendOtpEmail', async () => {
      const job = buildJob();

      await processor.process(job);

      expect(emailQueueService.sendOtpEmail).toHaveBeenCalledWith(otpData);
      expect(job.log).toHaveBeenCalled();
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
    it('logs that the job has completed', () => {
      const job = buildJob();

      processor.onCompleted(job);

      expect(job.log).toHaveBeenCalledWith(expect.stringContaining('has been completed'));
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

    it('defaults originalJobId to an empty string when job.id is missing', async () => {
      const job = buildJob({ id: undefined });

      await processor.onFailed(job);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({ originalJobId: '' })
      );
    });
  });

  describe('onStalled', () => {
    it('logs the stall and pushes the job to the DLQ', async () => {
      const job = buildJob({ attemptsMade: 3 });

      await processor.onStalled(job);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQueueName: QueueName.EMAIL,
          originalJobId: job.id,
          failedReason: 'Job stalled for too long. Current attempts: 3',
        })
      );
    });
  });

  describe('onError', () => {
    it('logs the worker error and pushes it to the DLQ', async () => {
      const job = buildJob();
      const error = new Error('worker exploded');

      await processor.onError(job, error);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQueueName: QueueName.EMAIL,
          originalJobId: job.id,
          failedReason: 'Processor error: worker exploded',
          stacktrace: expect.any(Array),
        })
      );
    });
  });
});
