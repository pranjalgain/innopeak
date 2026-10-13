import { CronJobName, QueueName } from '@bg/constants/job.constant';
import type { ICronJob } from '@bg/interfaces/job.interface';
import type { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import type { Job } from 'bullmq';

import { CronProcessor } from './cron.processor';
import type { CronService } from './cron.service';

type CronJobHandle = Job<ICronJob, void, CronJobName>;

describe('CronProcessor', () => {
  let processor: CronProcessor;
  let cronService: jest.Mocked<CronService>;
  let dlqService: jest.Mocked<DeadLetterQueueService>;

  const buildJob = (overrides: Record<string, unknown> = {}): CronJobHandle =>
    ({
      id: 'job-1',
      name: CronJobName.DAILY_MAIL,
      data: { jobType: CronJobName.DAILY_MAIL } as ICronJob,
      progress: 0,
      failedReason: undefined,
      stacktrace: [],
      attemptsMade: 1,
      log: jest.fn().mockResolvedValue(1),
      ...overrides,
    }) as unknown as CronJobHandle;

  beforeEach(() => {
    cronService = {
      sendDailyMail: jest.fn(),
      purgeStaleAuthTokens: jest.fn().mockResolvedValue(undefined),
      pollDueLocations: jest.fn().mockResolvedValue(undefined),
      purgeExpiredReviewerPii: jest.fn().mockResolvedValue(undefined),
      purgeErasureRequests: jest.fn().mockResolvedValue(undefined),
      reconcileStaleBillingSubscriptions: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CronService>;
    dlqService = {
      addFailedJobToDLQ: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DeadLetterQueueService>;
    processor = new CronProcessor(cronService, dlqService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('dispatches DAILY_MAIL jobs to CronService.sendDailyMail', async () => {
      const job = buildJob();

      await processor.process(job);

      expect(cronService.sendDailyMail).toHaveBeenCalledWith(job.data);
      expect(job.log).toHaveBeenCalled();
    });

    it('dispatches AUTH_TOKEN_CLEANUP jobs to CronService.purgeStaleAuthTokens and awaits it', async () => {
      const job = buildJob({
        name: CronJobName.AUTH_TOKEN_CLEANUP,
        data: { jobType: CronJobName.AUTH_TOKEN_CLEANUP },
      });

      await processor.process(job);

      expect(cronService.purgeStaleAuthTokens).toHaveBeenCalledTimes(1);
      expect(cronService.sendDailyMail).not.toHaveBeenCalled();
      expect(job.log).toHaveBeenCalledWith(expect.stringContaining('Completed job'));
    });

    it('dispatches REVIEW_SYNC_POLL jobs to CronService.pollDueLocations and awaits it', async () => {
      const job = buildJob({
        name: CronJobName.REVIEW_SYNC_POLL,
        data: { jobType: CronJobName.REVIEW_SYNC_POLL },
      });

      await processor.process(job);

      expect(cronService.pollDueLocations).toHaveBeenCalledTimes(1);
      expect(cronService.sendDailyMail).not.toHaveBeenCalled();
    });

    it('dispatches REVIEWER_RETENTION_PURGE jobs to CronService.purgeExpiredReviewerPii and awaits it', async () => {
      const job = buildJob({
        name: CronJobName.REVIEWER_RETENTION_PURGE,
        data: { jobType: CronJobName.REVIEWER_RETENTION_PURGE },
      });

      await processor.process(job);

      expect(cronService.purgeExpiredReviewerPii).toHaveBeenCalledTimes(1);
      expect(cronService.sendDailyMail).not.toHaveBeenCalled();
    });

    it('dispatches ERASURE_PURGE jobs to CronService.purgeErasureRequests and awaits it', async () => {
      const job = buildJob({
        name: CronJobName.ERASURE_PURGE,
        data: { jobType: CronJobName.ERASURE_PURGE },
      });

      await processor.process(job);

      expect(cronService.purgeErasureRequests).toHaveBeenCalledTimes(1);
      expect(cronService.sendDailyMail).not.toHaveBeenCalled();
    });

    it('dispatches BILLING_RECONCILIATION_SWEEP jobs to CronService.reconcileStaleBillingSubscriptions and awaits it', async () => {
      const job = buildJob({
        name: CronJobName.BILLING_RECONCILIATION_SWEEP,
        data: { jobType: CronJobName.BILLING_RECONCILIATION_SWEEP },
      });

      await processor.process(job);

      expect(cronService.reconcileStaleBillingSubscriptions).toHaveBeenCalledTimes(1);
      expect(cronService.sendDailyMail).not.toHaveBeenCalled();
    });

    it('rethrows when the purge fails so BullMQ retries it', async () => {
      const job = buildJob({ name: CronJobName.AUTH_TOKEN_CLEANUP });
      cronService.purgeStaleAuthTokens.mockRejectedValue(new Error('db down'));

      await expect(processor.process(job)).rejects.toThrow('db down');
    });

    it('throws for an unknown job name without calling the cron service', async () => {
      const job = buildJob({ name: 'unknown-job' });

      await expect(processor.process(job)).rejects.toThrow('Unknown job name: unknown-job');
      expect(cronService.sendDailyMail).not.toHaveBeenCalled();
    });

    it('logs and rethrows when CronService.sendDailyMail throws', async () => {
      const job = buildJob();
      const error = new Error('mail failure');
      cronService.sendDailyMail.mockImplementation(() => {
        throw error;
      });

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
      const job = buildJob({ progress: 42 });

      processor.onProgress(job);

      expect(job.log).toHaveBeenCalledWith(expect.stringContaining('42'));
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
        originalQueueName: QueueName.CRON,
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
    // BullMQ emits `(jobId, previousState)`; a stalled job is re-queued, or failed and then forwarded by `onFailed`.
    it('logs the stall from the job id alone and does not write to the DLQ', () => {
      expect(() => {
        processor.onStalled('job-123');
      }).not.toThrow();
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
