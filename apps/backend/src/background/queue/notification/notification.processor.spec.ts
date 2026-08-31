import { JobName, QueueName } from '@bg/constants/job.constant';
import type {
  INotificationJob,
  INotificationTopicJob,
  ISendNotificationJob,
} from '@bg/interfaces/job.interface';
import type { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import type { Job } from 'bullmq';

import type { NotificationQueueService } from './notification-queue.service';
import { NotificationProcessor } from './notification.processor';

type NotificationJobData = INotificationJob | INotificationTopicJob | ISendNotificationJob;
type NotificationJobHandle = Job<NotificationJobData, void, JobName>;

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;
  let notificationQueueService: jest.Mocked<NotificationQueueService>;
  let dlqService: jest.Mocked<DeadLetterQueueService>;

  const deviceData: INotificationJob = {
    deviceFids: ['fid-1'],
    subject: 'Hello',
    message: 'World',
    url: 'https://example.com',
    data: {},
  };

  const topicData: INotificationTopicJob = {
    topic: 'news',
    subject: 'Hello',
    message: 'World',
    url: 'https://example.com',
    data: {},
  };

  const sendData: ISendNotificationJob = {
    user_ids: ['user-1'],
    subject: 'Hello',
    message: 'World',
    url: 'https://example.com',
    notification_type: 'in-app',
  };

  const buildJob = (overrides: Record<string, unknown> = {}): NotificationJobHandle =>
    ({
      id: 'job-1',
      name: JobName.NOTIFICATION_TO_DEVICE,
      data: deviceData,
      progress: 0,
      failedReason: undefined,
      stacktrace: [],
      attemptsMade: 1,
      log: jest.fn().mockResolvedValue(1),
      ...overrides,
    }) as unknown as NotificationJobHandle;

  beforeEach(() => {
    notificationQueueService = {
      sendNotificationToDevice: jest.fn().mockResolvedValue(undefined),
      sendNotificationToTopic: jest.fn(),
      sendNotification: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationQueueService>;
    dlqService = {
      addFailedJobToDLQ: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DeadLetterQueueService>;
    processor = new NotificationProcessor(notificationQueueService, dlqService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('dispatches NOTIFICATION_TO_DEVICE jobs to sendNotificationToDevice', async () => {
      const job = buildJob();

      await processor.process(job);

      expect(notificationQueueService.sendNotificationToDevice).toHaveBeenCalledWith(deviceData);
      expect(job.log).toHaveBeenCalled();
    });

    it('dispatches NOTIFICATION_TO_TOPIC jobs to sendNotificationToTopic', async () => {
      const job = buildJob({ name: JobName.NOTIFICATION_TO_TOPIC, data: topicData });

      await processor.process(job);

      expect(notificationQueueService.sendNotificationToTopic).toHaveBeenCalledWith(topicData);
    });

    it('dispatches NOTIFICATION_SEND jobs to sendNotification', async () => {
      const job = buildJob({ name: JobName.NOTIFICATION_SEND, data: sendData });

      await processor.process(job);

      expect(notificationQueueService.sendNotification).toHaveBeenCalledWith(sendData);
    });

    it('throws for an unknown job name without calling any queue service method', async () => {
      const job = buildJob({ name: 'unknown-job' });

      await expect(processor.process(job)).rejects.toThrow(
        'Unknown job type: unknown-job. Please check the job name and try again.'
      );
      expect(notificationQueueService.sendNotificationToDevice).not.toHaveBeenCalled();
      expect(notificationQueueService.sendNotificationToTopic).not.toHaveBeenCalled();
      expect(notificationQueueService.sendNotification).not.toHaveBeenCalled();
    });

    it('logs and rethrows when sendNotificationToDevice rejects', async () => {
      const job = buildJob();
      const error = new Error('fcm down');
      notificationQueueService.sendNotificationToDevice.mockRejectedValue(error);

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
      const job = buildJob({ progress: 30 });

      processor.onProgress(job);

      expect(job.log).toHaveBeenCalledWith(expect.stringContaining('30'));
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
        originalQueueName: QueueName.NOTIFICATION,
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
      const job = buildJob({ attemptsMade: 4 });

      await processor.onStalled(job);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQueueName: QueueName.NOTIFICATION,
          originalJobId: job.id,
          failedReason: 'Job stalled for too long. Current attempts: 4',
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
          originalQueueName: QueueName.NOTIFICATION,
          originalJobId: job.id,
          failedReason: 'Processor error: worker exploded',
          stacktrace: expect.any(Array),
        })
      );
    });
  });
});
