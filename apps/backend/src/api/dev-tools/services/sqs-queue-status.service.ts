import { GetQueueAttributesCommand, GetQueueUrlCommand, SQSClient } from '@aws-sdk/client-sqs';
import { getQueueUrlEnvKey, QUEUE_LIST } from '@bg/constants/job.constant';
import { getAwsEndpointOverride, getFlociCredentials } from '@common/helpers/aws-endpoint.util';
import { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { QueueDepthDto } from '../dto/queue-depth.dto';

/**
 * Read-only DLQ/queue-depth visibility for 'aws' mode — Bull Board has no SQS equivalent, so this
 * powers the dev-tools "SQS Queues" panel instead (per the plan's decision #2). The DLQ queue URL
 * isn't stored anywhere explicitly; it's derived from the main queue's own RedrivePolicy
 * attribute, so no extra env vars/secrets are needed beyond the `<QUEUE>_QUEUE_URL` set already
 * used by `SqsQueuePublisher`/`SqsQueueConsumerBase`.
 */
@Injectable()
export class SqsQueueStatusService {
  private readonly logger = new Logger(SqsQueueStatusService.name);
  private readonly sqsClient: SQSClient;

  constructor(private readonly configService: ConfigService<EnvConfig>) {
    const endpoint = getAwsEndpointOverride(this.configService);
    const credentials = getFlociCredentials(this.configService);
    this.sqsClient = new SQSClient({
      region: this.configService.get<string>('AWS_REGION' as keyof EnvConfig) ?? 'us-east-1',
      ...(endpoint ? { endpoint } : {}),
      ...(credentials ? { credentials } : {}),
    });
  }

  async getQueueDepths(): Promise<QueueDepthDto[]> {
    const results: QueueDepthDto[] = [];

    for (const queueName of QUEUE_LIST) {
      const queueUrl = this.configService.get<string>(
        getQueueUrlEnvKey(queueName) as keyof EnvConfig
      );
      if (!queueUrl) {
        continue;
      }

      try {
        results.push(await this.getDepthForQueue(queueName, queueUrl));
      } catch (error) {
        this.logger.error(
          `Failed to fetch queue depth for "${queueName}": ${(error as Error).message}`
        );
      }
    }

    return results;
  }

  private async getDepthForQueue(queueName: string, queueUrl: string): Promise<QueueDepthDto> {
    const { Attributes } = await this.sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages', 'RedrivePolicy'],
      })
    );

    const mainDepth = Number(Attributes?.['ApproximateNumberOfMessages'] ?? 0);
    const dlqDepth = await this.getDlqDepth(Attributes?.['RedrivePolicy']);

    return { queueName, mainDepth, dlqDepth };
  }

  private async getDlqDepth(redrivePolicyJson: string | undefined): Promise<number | null> {
    if (!redrivePolicyJson) {
      return null;
    }

    const { deadLetterTargetArn } = JSON.parse(redrivePolicyJson) as {
      deadLetterTargetArn?: string;
    };
    const dlqName = deadLetterTargetArn?.split(':').pop();
    if (!dlqName) {
      return null;
    }

    const { QueueUrl: dlqUrl } = await this.sqsClient.send(
      new GetQueueUrlCommand({ QueueName: dlqName })
    );
    if (!dlqUrl) {
      return null;
    }

    const { Attributes } = await this.sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: dlqUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      })
    );

    return Number(Attributes?.['ApproximateNumberOfMessages'] ?? 0);
  }
}
