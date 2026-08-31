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
    cronService = { sendDailyMail: jest.fn() } as unknown as jest.Mocked<CronService>;
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
    it('logs the stall and pushes the job to the DLQ when called with a well-formed Job', async () => {
      const job = buildJob({ attemptsMade: 2 });

      await processor.onStalled(job);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQueueName: QueueName.CRON,
          originalJobId: job.id,
          failedReason: 'Job stalled for too long. Current attempts: 2',
        })
      );
    });

    // KNOWN BUG (flagged by the task, intentionally NOT fixed here): BullMQ's `stalled`
    // worker event actually emits `(jobId: string, prev: string)`, not a `Job` instance.
    // `onStalled(job: CronJobHandle)`'s declared signature doesn't match that runtime
    // reality. This test documents the CURRENT (buggy, but non-crashing) behavior when the
    // handler is invoked the way BullMQ really invokes it: `job` ends up being a bare
    // string, so `job.id` / `job.name` / `job.attemptsMade` are all `undefined`, and the
    // DLQ entry silently gets garbage data instead of throwing.
    it('documents the stalled-event signature mismatch: real BullMQ args produce garbage DLQ data, not a crash', async () => {
      // BullMQ actually calls this handler as `onStalled(jobId, prev)`, but the handler is
      // typed/declared to accept only a single `Job` parameter.
      const realisticJobIdArg = 'job-123';

      await processor.onStalled(realisticJobIdArg as unknown as CronJobHandle);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({
          originalJobId: '',
          originalJobName: undefined,
          originalJobData: undefined,
          failedReason: 'Job stalled for too long. Current attempts: undefined',
        })
      );
    });
  });

  describe('onError', () => {
    it('logs the worker error and pushes it to the DLQ when called with a well-formed Job + Error', async () => {
      const job = buildJob();
      const error = new Error('worker exploded');

      await processor.onError(job, error);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQueueName: QueueName.CRON,
          originalJobId: job.id,
          failedReason: 'Processor error: worker exploded',
        })
      );
    });

    // KNOWN BUG (flagged by the task, intentionally NOT fixed here): BullMQ's `error`
    // worker event actually emits a single `Error` argument, not `(job: Job, error: Error)`.
    // Calling the handler the way BullMQ really calls it crashes: `job` becomes the Error
    // instance and `error` is `undefined`, so `error.message` throws a TypeError. This test
    // documents that CURRENT (buggy) crash behavior rather than silently changing it.
    it('documents the error-event signature mismatch: real BullMQ single-Error arg crashes the handler', async () => {
      const realError = new Error('worker exploded');

      await expect(
        processor.onError(realError as unknown as CronJobHandle, undefined as unknown as Error)
      ).rejects.toThrow(TypeError);
    });
  });
});
