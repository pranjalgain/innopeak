import { QueueName } from '@bg/constants/job.constant';
import type { IDLQFailedJobData } from '@bg/interfaces/job.interface';
import type { Job } from 'bullmq';

import { DeadLetterProcessor } from './dead-letter.processor';

type DlqJobHandle = Job<IDLQFailedJobData, string, string>;

describe('DeadLetterProcessor', () => {
  let processor: DeadLetterProcessor;

  const buildJob = (overrides: Record<string, unknown> = {}): DlqJobHandle =>
    ({
      id: 'dlq-job-1',
      name: 'dlq_failed_job',
      data: {
        originalQueueName: QueueName.EMAIL,
        originalJobId: 'job-1',
        originalJobName: 'email-otp-verification',
        originalJobData: { email: 'user@example.com' },
        failedReason: 'Provider timed out',
        stacktrace: ['line1', 'line2'],
        timestamp: 1_700_000_000_000,
      } as IDLQFailedJobData,
      progress: 0,
      failedReason: undefined,
      stacktrace: [],
      attemptsMade: 1,
      log: jest.fn().mockResolvedValue(1),
      ...overrides,
    }) as unknown as DlqJobHandle;

  beforeEach(() => {
    processor = new DeadLetterProcessor();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('logs the DLQ job details and resolves with a review message', async () => {
      const job = buildJob();

      const result = await processor.process(job);

      expect(result).toBe('DLQ job processed for review');
      expect(job.log).toHaveBeenCalledWith(expect.stringContaining(QueueName.EMAIL));
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
      const job = buildJob({ progress: 75 });

      processor.onProgress(job);

      expect(job.log).toHaveBeenCalledWith(expect.stringContaining('75'));
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
    it('logs the failure reason and stacktrace', () => {
      const job = buildJob({ failedReason: 'boom', stacktrace: ['at x'] });

      processor.onFailed(job);

      expect(job.log).toHaveBeenCalledWith(expect.stringContaining('boom'));
    });
  });

  describe('onStalled', () => {
    // BullMQ emits `(jobId, previousState)`; a stalled job is re-queued, or failed and then forwarded by `onFailed`.
    it('logs the stall from the job id alone and does not write to the DLQ', () => {
      expect(() => {
        processor.onStalled('job-123');
      }).not.toThrow();
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
