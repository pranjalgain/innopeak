import { JobName, QueueName } from '@bg/constants/job.constant';
import type { IDLQFailedJobData } from '@bg/interfaces/job.interface';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { DeadLetterQueueService } from './dead-letter-queue.service';

describe('DeadLetterQueueService', () => {
  let target: DeadLetterQueueService;
  let queuePublisher: { publish: jest.Mock };

  const data: IDLQFailedJobData = {
    originalQueueName: QueueName.EMAIL,
    originalJobId: 'job-1',
    originalJobName: JobName.OTP_EMAIL_VERIFICATION,
    originalJobData: { email: 'user@example.com' },
    failedReason: 'Provider timed out',
    stacktrace: ['line1', 'line2'],
    timestamp: 1_700_000_000_000,
  };

  beforeEach(async () => {
    queuePublisher = { publish: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterQueueService,
        { provide: QueuePublisherProvider, useValue: queuePublisher },
      ],
    }).compile();

    target = module.get(DeadLetterQueueService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('addFailedJobToDLQ', () => {
    it('adds the failed job to the DLQ with the correct job name and payload', async () => {
      queuePublisher.publish.mockResolvedValue(undefined);

      await target.addFailedJobToDLQ(data);

      expect(queuePublisher.publish).toHaveBeenCalledTimes(1);
      expect(queuePublisher.publish).toHaveBeenCalledWith(
        QueueName.DEAD_LETTER,
        JobName.DLQ_FAILED_JOB,
        data
      );
    });

    it('propagates the error when the queue add call rejects', async () => {
      const error = new Error('Redis connection lost');
      queuePublisher.publish.mockRejectedValue(error);

      await expect(target.addFailedJobToDLQ(data)).rejects.toThrow(error);
      expect(queuePublisher.publish).toHaveBeenCalledWith(
        QueueName.DEAD_LETTER,
        JobName.DLQ_FAILED_JOB,
        data
      );
    });
  });
});
