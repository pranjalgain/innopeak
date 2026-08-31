import { JobName, QueueName } from '@bg/constants/job.constant';
import type { IWebhookDeliveryJob } from '@bg/interfaces/job.interface';
import type { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import type { Job } from 'bullmq';

import type { WebhookQueueService } from './webhook-queue.service';
import { WebhookProcessor } from './webhook.processor';

type WebhookJob = Job<IWebhookDeliveryJob, unknown, JobName>;

describe('WebhookProcessor', () => {
  let processor: WebhookProcessor;
  let webhookQueueService: jest.Mocked<WebhookQueueService>;
  let dlqService: jest.Mocked<DeadLetterQueueService>;

  const webhookData: IWebhookDeliveryJob = {
    webhookId: 'wh-1',
    deliveryId: 'delivery-1',
    url: 'https://example.com/hook',
    secret: 'shh',
    event: 'user.created',
    payload: { id: 'user-1' },
  };

  const buildJob = (overrides: Record<string, unknown> = {}): WebhookJob =>
    ({
      id: 'job-1',
      name: JobName.WEBHOOK_DELIVER,
      data: webhookData,
      progress: 0,
      failedReason: undefined,
      stacktrace: [],
      attemptsMade: 1,
      log: jest.fn().mockResolvedValue(1),
      ...overrides,
    }) as unknown as WebhookJob;

  beforeEach(() => {
    webhookQueueService = {
      deliverWebhook: jest.fn().mockResolvedValue({ statusCode: 200, body: 'ok' }),
    } as unknown as jest.Mocked<WebhookQueueService>;
    dlqService = {
      addFailedJobToDLQ: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DeadLetterQueueService>;
    processor = new WebhookProcessor(webhookQueueService, dlqService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('dispatches WEBHOOK_DELIVER jobs to WebhookQueueService.deliverWebhook and returns the result', async () => {
      const job = buildJob();

      const result = await processor.process(job);

      expect(webhookQueueService.deliverWebhook).toHaveBeenCalledWith(webhookData);
      expect(result).toEqual({ statusCode: 200, body: 'ok' });
      expect(job.log).toHaveBeenCalled();
    });

    it('throws for an unknown job name without calling the webhook queue service', async () => {
      const job = buildJob({ name: 'unknown-job' });

      await expect(processor.process(job)).rejects.toThrow('Unknown job name: unknown-job');
      expect(webhookQueueService.deliverWebhook).not.toHaveBeenCalled();
    });

    it('logs and rethrows when WebhookQueueService.deliverWebhook rejects', async () => {
      const job = buildJob();
      const error = new Error('endpoint unreachable');
      webhookQueueService.deliverWebhook.mockRejectedValue(error);

      await expect(processor.process(job)).rejects.toThrow(error);
      expect(job.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process webhook delivery job')
      );
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
      const job = buildJob({ progress: 60 });

      processor.onProgress(job);

      expect(job.log).toHaveBeenCalledWith(expect.stringContaining('60'));
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
        originalQueueName: QueueName.WEBHOOK,
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
      const job = buildJob({ attemptsMade: 5 });

      await processor.onStalled(job);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQueueName: QueueName.WEBHOOK,
          originalJobId: job.id,
          failedReason: 'Job stalled for too long. Current attempts: 5',
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
          originalQueueName: QueueName.WEBHOOK,
          originalJobId: job.id,
          failedReason: 'Processor error: worker exploded',
          stacktrace: expect.any(Array),
        })
      );
    });
  });
});
