import type { QueueName } from '@bg/constants/job.constant';

export interface PublishOptions {
  attempts?: number;
  backoffDelayMs?: number;
  /** SQS caps this at 15 minutes; `SqsQueuePublisher` clamps rather than rejecting. */
  delayMs?: number;
}

/** Transport-agnostic producer; BullMQ or SQS is chosen in `queue-transport.module.ts` by DEPLOYMENT_TARGET. */
export abstract class QueuePublisherProvider {
  abstract publish<T>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: PublishOptions
  ): Promise<void>;
}
