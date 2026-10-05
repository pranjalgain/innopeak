import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { QueueName } from '@bg/constants/job.constant';
import { getQueueUrlEnvKey } from '@bg/constants/job.constant';
import type { PublishOptions } from '@bg/providers/queue-publisher.provider';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { getAwsEndpointOverride, getFlociCredentials } from '@common/helpers/aws-endpoint.util';
import type { EnvConfig } from '@config/env.config';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

/** SQS's hard ceiling on `DelaySeconds` (15 minutes). */
const SQS_MAX_DELAY_SECONDS = 900;

export class SqsQueuePublisher extends QueuePublisherProvider {
  private readonly logger = new Logger(SqsQueuePublisher.name);
  private readonly sqsClient: SQSClient;

  constructor(private readonly configService: ConfigService<EnvConfig>) {
    super();

    const endpoint = getAwsEndpointOverride(this.configService);
    const credentials = getFlociCredentials(this.configService);
    this.sqsClient = new SQSClient({
      region: this.configService.get<string>('AWS_REGION' as keyof EnvConfig) ?? 'us-east-1',
      ...(endpoint ? { endpoint } : {}),
      ...(credentials ? { credentials } : {}),
    });
  }

  async publish<T>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options?: PublishOptions
  ): Promise<void> {
    const envKey = getQueueUrlEnvKey(queueName);
    const queueUrl = this.configService.get<string>(envKey as keyof EnvConfig);
    if (!queueUrl) {
      throw new Error(`Missing ${envKey} — required to publish to "${queueName}" over SQS`);
    }

    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(data),
        ...(options?.delayMs
          ? {
              DelaySeconds: Math.min(
                SQS_MAX_DELAY_SECONDS,
                Math.max(0, Math.ceil(options.delayMs / 1000))
              ),
            }
          : {}),
        MessageAttributes: {
          JobName: { DataType: 'String', StringValue: jobName },
        },
      })
    );

    this.logger.debug(`Published job "${jobName}" to SQS queue "${queueName}"`);
  }
}
