import type { QueueName } from '@bg/constants/job.constant';
import type { PublishOptions } from '@bg/providers/queue-publisher.provider';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import type { Queue } from 'bullmq';

export class BullMqQueuePublisher extends QueuePublisherProvider {
  constructor(private readonly queues: Partial<Record<QueueName, Queue>>) {
    super();
  }

  async publish<T>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: PublishOptions
  ): Promise<void> {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`No BullMQ queue registered for "${queueName}"`);
    }

    await queue.add(jobName, data, {
      ...(options?.attempts ? { attempts: options.attempts } : {}),
      ...(options?.backoffDelayMs
        ? { backoff: { type: 'exponential', delay: options.backoffDelayMs } }
        : {}),
    });
  }
}
