import { JobName, QueueName } from '@bg/constants/job.constant';
import type { IReviewBackfillJob, IReviewSyncJob } from '@bg/interfaces/job.interface';
import type { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import type { ReviewSyncQueueService } from '@review-sync-queue/review-sync-queue.service';
import type { Job } from 'bullmq';

import { ReviewSyncProcessor } from './review-sync.processor';

type ReviewSyncJobHandle = Job<IReviewSyncJob, void, JobName>;

describe('ReviewSyncProcessor', () => {
  let processor: ReviewSyncProcessor;
  let reviewSyncQueueService: jest.Mocked<ReviewSyncQueueService>;
  let dlqService: jest.Mocked<DeadLetterQueueService>;

  const pollData: IReviewSyncJob = {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    connectionId: 'conn-1',
    externalAccountId: 'acct-1',
    externalLocationId: 'ext-loc-1',
  };
  const backfillData: IReviewBackfillJob = { ...pollData, syncRunId: 'run-1' };

  const buildJob = (overrides: Record<string, unknown> = {}): ReviewSyncJobHandle =>
    ({
      id: 'job-1',
      name: JobName.REVIEW_POLL,
      data: pollData,
      failedReason: undefined,
      stacktrace: [],
      attemptsMade: 0,
      opts: { attempts: 1 },
      ...overrides,
    }) as unknown as ReviewSyncJobHandle;

  beforeEach(() => {
    reviewSyncQueueService = {
      runBackfill: jest.fn().mockResolvedValue(undefined),
      runPoll: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ReviewSyncQueueService>;
    dlqService = {
      addFailedJobToDLQ: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DeadLetterQueueService>;
    processor = new ReviewSyncProcessor(reviewSyncQueueService, dlqService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('dispatches REVIEW_POLL jobs to ReviewSyncQueueService.runPoll', async () => {
      const job = buildJob();

      await processor.process(job);

      expect(reviewSyncQueueService.runPoll).toHaveBeenCalledWith(pollData);
    });

    it('dispatches REVIEW_BACKFILL jobs to ReviewSyncQueueService.runBackfill with isRetry from attemptsMade', async () => {
      const job = buildJob({
        name: JobName.REVIEW_BACKFILL,
        data: backfillData,
        attemptsMade: 1,
      });

      await processor.process(job);

      expect(reviewSyncQueueService.runBackfill).toHaveBeenCalledWith(backfillData, true);
    });

    it('throws for an unknown job name without dispatching', async () => {
      const job = buildJob({ name: 'unknown-job' });

      await expect(processor.process(job)).rejects.toThrow('Unknown job name: unknown-job');
      expect(reviewSyncQueueService.runPoll).not.toHaveBeenCalled();
    });

    it('logs and rethrows when the queue service rejects', async () => {
      const job = buildJob();
      const error = new Error('google api down');
      reviewSyncQueueService.runPoll.mockRejectedValue(error);

      await expect(processor.process(job)).rejects.toThrow(error);
    });
  });

  describe('onFailed', () => {
    /**
     * The regression this guards: BullMQ fires `failed` after every failed attempt, not only the
     * last one. A job that fails once and then succeeds on retry used to land in the DLQ on that
     * first failure too, corrupting the DLQ's signal with failures that go on to self-heal.
     */
    it('does not push to the DLQ when more retry attempts remain', async () => {
      const job = buildJob({ attemptsMade: 1, opts: { attempts: 2 } });

      await processor.onFailed(job);

      expect(dlqService.addFailedJobToDLQ).not.toHaveBeenCalled();
    });

    it('pushes to the DLQ once the final retry attempt is exhausted', async () => {
      const job = buildJob({
        attemptsMade: 2,
        opts: { attempts: 2 },
        failedReason: 'boom',
        stacktrace: ['at x'],
      });

      await processor.onFailed(job);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith({
        originalQueueName: QueueName.REVIEW_SYNC,
        originalJobId: job.id,
        originalJobName: job.name,
        originalJobData: job.data,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        timestamp: expect.any(Number),
      });
    });

    it('treats a missing opts.attempts as a single-attempt job (terminal on first failure)', async () => {
      const job = buildJob({ attemptsMade: 1, opts: {} });

      await processor.onFailed(job);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledTimes(1);
    });
  });

  describe('onStalled', () => {
    it('pushes the stalled job to the DLQ', async () => {
      const job = buildJob({ attemptsMade: 1 });

      await processor.onStalled(job);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQueueName: QueueName.REVIEW_SYNC,
          originalJobId: job.id,
        })
      );
    });
  });
});
