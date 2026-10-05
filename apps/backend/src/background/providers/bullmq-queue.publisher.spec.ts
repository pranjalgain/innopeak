import { QueueName } from '@bg/constants/job.constant';
import type { Queue } from 'bullmq';

import { BullMqQueuePublisher } from './bullmq-queue.publisher';

describe('BullMqQueuePublisher', () => {
  const add = jest.fn().mockResolvedValue(undefined);
  const publisher = new BullMqQueuePublisher({
    [QueueName.REVIEW_POST]: { add } as unknown as Queue,
  });

  beforeEach(() => add.mockClear());

  it('passes delayMs through as a BullMQ delay', async () => {
    await publisher.publish(QueueName.REVIEW_POST, 'job', { a: 1 }, { delayMs: 60_000 });

    expect(add).toHaveBeenCalledWith('job', { a: 1 }, { delay: 60_000 });
  });

  it('adds no delay when none is requested', async () => {
    await publisher.publish(QueueName.REVIEW_POST, 'job', { a: 1 });

    expect(add).toHaveBeenCalledWith('job', { a: 1 }, {});
  });
});
