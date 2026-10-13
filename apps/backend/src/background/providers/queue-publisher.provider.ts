import type { QueueName } from '@bg/constants/job.constant';

export interface PublishOptions {
  attempts?: number;
  backoffDelayMs?: number;
  /** SQS caps this at 15 minutes; `SqsQueuePublisher` clamps rather than rejecting. */
  delayMs?: number;
  /**
   * Makes the job idempotent to enqueue: while a job with this id exists, publishing it again is a no-op. BullMQ only; SQS standard
   * queues cannot deduplicate, so on SQS the caller must tolerate duplicates. Must not contain `:` (BullMQ rejects it).
   */
  jobId?: string;
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
