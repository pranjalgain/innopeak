import type { Message } from '@aws-sdk/client-sqs';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { QueueName } from '@bg/constants/job.constant';
import { getQueueUrlEnvKey } from '@bg/constants/job.constant';
import { getAwsEndpointOverride, getFlociCredentials } from '@common/helpers/aws-endpoint.util';
import type { EnvConfig } from '@config/env.config';
import type { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

/**
 * Stands in for BullMQ's `@Processor`/`WorkerHost` with a long-polling loop: success deletes the
 * message; failure leaves it so the visibility timeout expires and SQS redrive moves it to the
 * `-dlq` queue after `maxReceiveCount` attempts (see infra/floci/sqs.tf).
 */
export abstract class SqsQueueConsumerBase implements OnModuleInit, OnModuleDestroy {
  protected abstract readonly queueName: QueueName;
  protected abstract readonly logger: Logger;

  private readonly sqsClient: SQSClient;
  private queueUrl: string | undefined;
  private polling = false;

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
    void this.pollLoop();
  }

  onModuleDestroy(): void {
    this.polling = false;
  }

  protected abstract process(jobName: string, data: unknown): Promise<void>;

  /** No-op hook run after `process()` throws; consumers override it to record into `DeadLetterQueueService` so the DLQ panel has the same failure metadata as under BullMQ. */
  protected onProcessingFailed(_jobName: string, _data: unknown, _error: Error): Promise<void> {
    return Promise.resolve();
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        const { Messages } = await this.sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20,
            MessageAttributeNames: ['JobName'],
          })
        );

        for (const message of Messages ?? []) {
          await this.handleMessage(message);
        }
      } catch (error) {
        this.logger.error(
          `SQS poll loop error on "${this.queueName}": ${(error as Error).message}`,
          (error as Error).stack
        );
      }
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    const jobName = message.MessageAttributes?.['JobName']?.StringValue ?? 'unknown';
    const data: unknown = message.Body ? JSON.parse(message.Body) : undefined;

    try {
      await this.process(jobName, data);
      await this.sqsClient.send(
        new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: message.ReceiptHandle })
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to process SQS message ${message.MessageId ?? ''} (job "${jobName}") on ` +
          `"${this.queueName}": ${err.message}`
      );
      // Left in place so the visibility timeout expires and redrive moves it to the -dlq.
      await this.onProcessingFailed(jobName, data, err);
    }
  }
}
