import type { Message } from '@aws-sdk/client-sqs';
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import type { QueueName } from '@bg/constants/job.constant';
import { getQueueUrlEnvKey } from '@bg/constants/job.constant';
import { getAwsEndpointOverride, getFlociCredentials } from '@common/helpers/aws-endpoint.util';
import type { EnvConfig } from '@config/env.config';
import type { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

/** Mirrors `visibility_timeout_seconds` in infra/floci/sqs.tf: how long a received message stays hidden before SQS offers it again. */
export const SQS_VISIBILITY_TIMEOUT_SECONDS = 60;
/** Mirrors `maxReceiveCount` in infra/floci/sqs.tf: the receive after which redrive moves a message to the `-dlq`. */
export const SQS_MAX_RECEIVE_COUNT = 3;
/** The pause after a receive error starts here and doubles up to the cap, so a down queue is not hammered in a tight loop. */
export const SQS_RECEIVE_BACKOFF_START_MS = 1_000;
export const SQS_RECEIVE_BACKOFF_MAX_MS = 60_000;
/** How long shutdown waits for the message being handled before giving up on it (the visibility timeout then offers it again). */
export const SQS_SHUTDOWN_DRAIN_MS = 25_000;

/**
 * Stands in for BullMQ's `@Processor`/`WorkerHost` with a long-polling loop: success deletes the
 * message; failure leaves it so the visibility timeout expires and SQS redrive moves it to the
 * `-dlq` queue after `maxReceiveCount` attempts (see infra/floci/sqs.tf).
 *
 * While a message is being processed its visibility is extended on a timer: a job that outlives the 60 s timeout (the erasure purge, a
 * fan-out) would otherwise be offered to another consumer and run twice, and its success would still be redriven to the `-dlq` after
 * three such receives. A failure is filed in the application's dead-letter queue only on the *last* receive, since each earlier one is
 * about to be retried.
 */
export abstract class SqsQueueConsumerBase implements OnModuleInit, OnModuleDestroy {
  protected abstract readonly queueName: QueueName;
  protected abstract readonly logger: Logger;

  private readonly sqsClient: SQSClient;
  private queueUrl: string | undefined;
  private polling = false;
  private loop: Promise<void> | null = null;
  private readonly shutdown = new AbortController();

  constructor(private readonly configService: ConfigService<EnvConfig>) {
    const endpoint = getAwsEndpointOverride(this.configService);
    const credentials = getFlociCredentials(this.configService);
    this.sqsClient = new SQSClient({
      region: this.configService.get<string>('AWS_REGION' as keyof EnvConfig) ?? 'us-east-1',
      ...(endpoint ? { endpoint } : {}),
      ...(credentials ? { credentials } : {}),
    });
  }

  onModuleInit(): void {
    const envKey = getQueueUrlEnvKey(this.queueName);
    this.queueUrl = this.configService.get<string>(envKey as keyof EnvConfig);
    if (!this.queueUrl) {
      throw new Error(`Missing ${envKey} — required to consume "${this.queueName}" over SQS`);
    }

    this.polling = true;
    this.loop = this.pollLoop();
  }

  /**
   * Stops receiving, then lets the message already being handled finish (up to `SQS_SHUTDOWN_DRAIN_MS`). Flipping a flag alone left that
   * job running while Nest closed the database and Redis under it, so a routine deploy failed it, spent one of its receives and could
   * send it to the dead-letter queue.
   */
  async onModuleDestroy(): Promise<void> {
    this.polling = false;
    // Ends a long poll that is only waiting for a message; one already received is not affected and is handled to the end.
    this.shutdown.abort();
    if (this.loop === null) {
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>(resolve => {
      timer = setTimeout(resolve, SQS_SHUTDOWN_DRAIN_MS);
    });
    try {
      await Promise.race([this.loop, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  protected abstract process(jobName: string, data: unknown): Promise<void>;

  /** No-op hook run after `process()` throws; consumers override it to record into `DeadLetterQueueService` so the DLQ panel has the same failure metadata as under BullMQ. */
  protected onProcessingFailed(_jobName: string, _data: unknown, _error: Error): Promise<void> {
    return Promise.resolve();
  }

  private async pollLoop(): Promise<void> {
    let backoffMs = SQS_RECEIVE_BACKOFF_START_MS;
    while (this.polling) {
      try {
        const { Messages } = await this.sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20,
            MessageAttributeNames: ['JobName'],
            MessageSystemAttributeNames: ['ApproximateReceiveCount'],
          }),
          { abortSignal: this.shutdown.signal }
        );
        backoffMs = SQS_RECEIVE_BACKOFF_START_MS;

        for (const message of Messages ?? []) {
          await this.handleMessage(message);
        }
      } catch (error) {
        // The long poll aborted by shutdown is not a fault.
        if (!this.polling) {
          return;
        }
        this.logger.error(
          `SQS poll loop error on "${this.queueName}": ${(error as Error).message}; retrying in ${Math.round(backoffMs / 1000)}s`,
          (error as Error).stack
        );
        await this.sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, SQS_RECEIVE_BACKOFF_MAX_MS);
      }
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async handleMessage(message: Message): Promise<void> {
    const jobName = message.MessageAttributes?.['JobName']?.StringValue ?? 'unknown';
    const receiveCount = Number(message.Attributes?.['ApproximateReceiveCount'] ?? '1');
    const heartbeat = this.keepVisible(message);

    let data: unknown;
    try {
      // Inside the try: a body that is not JSON is this message's failure (left for redrive), not a poll-loop error.
      data = message.Body ? JSON.parse(message.Body) : undefined;
      await this.process(jobName, data);
      await this.sqsClient.send(
        new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: message.ReceiptHandle })
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to process SQS message ${message.MessageId ?? ''} (job "${jobName}", receive ${receiveCount}/${SQS_MAX_RECEIVE_COUNT}) on ` +
          `"${this.queueName}": ${err.message}`
      );
      // Left in place so the visibility timeout expires and redrive moves it to the -dlq. Filed in the dashboard only once it is
      // really out of attempts, otherwise one failing message would be listed once per receive.
      if (receiveCount >= SQS_MAX_RECEIVE_COUNT) {
        try {
          await this.onProcessingFailed(jobName, data, err);
        } catch (filingError) {
          // Not rethrown: it would surface as a poll-loop error and back the whole loop off, for a message that redrive handles anyway.
          this.logger.error(
            `Could not file failed SQS message ${message.MessageId ?? ''} on "${this.queueName}": ${(filingError as Error).message}`
          );
        }
      }
    } finally {
      clearInterval(heartbeat);
    }
  }

  /**
   * Re-hides the message for another timeout, halfway through each one, until processing ends. A failed extension is logged and
   * not thrown: the job carries on, and at worst SQS offers the message again, as it would have without this.
   */
  private keepVisible(message: Message): NodeJS.Timeout {
    return setInterval(
      () => {
        this.sqsClient
          .send(
            new ChangeMessageVisibilityCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
              VisibilityTimeout: SQS_VISIBILITY_TIMEOUT_SECONDS,
            })
          )
          .catch((error: unknown) => {
            this.logger.warn(
              `Could not extend the visibility of SQS message ${message.MessageId ?? ''} on "${this.queueName}": ${(error as Error).message}`
            );
          });
      },
      (SQS_VISIBILITY_TIMEOUT_SECONDS / 2) * 1000
    );
  }
}
