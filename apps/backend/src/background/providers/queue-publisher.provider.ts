import type { QueueName } from '@bg/constants/job.constant';

export interface PublishOptions {
  attempts?: number;
  backoffDelayMs?: number;
}

/**
 * Producer-side abstraction over the job queue transport. `BullMqQueuePublisher` (local) and
 * `SqsQueuePublisher` (aws) are selected in `queue-transport.module.ts` based on
 * DEPLOYMENT_TARGET — callers (e.g. `EmailQueue`) never know which transport is active.
 */
export abstract class QueuePublisherProvider {
  abstract publish<T>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: PublishOptions
  ): Promise<void>;
}
