import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { QueueName } from '@bg/constants/job.constant';
import { getQueueUrlEnvKey } from '@bg/constants/job.constant';
import type { PublishOptions } from '@bg/providers/queue-publisher.provider';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { getAwsEndpointOverride, getFlociCredentials } from '@common/helpers/aws-endpoint.util';
import { withTimeout } from '@common/helpers/with-timeout';
import type { EnvConfig } from '@config/env.config';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';

/** SQS's hard ceiling on `DelaySeconds` (15 minutes). */
const SQS_MAX_DELAY_SECONDS = 900;

/** How long a published `jobId` is remembered; a cron tick's id carries its minute, so a few minutes is more than enough. */
const SQS_JOB_ID_DEDUPE_SECONDS = 300;

/**
 * The shared Redis client queues a command for a dead connection indefinitely instead of rejecting it, so without a bound "Redis failed:
 * publish anyway" only held for an error reply, and during an outage every scheduled tick that carries a job id hung here.
 */
const REDIS_TIMEOUT_MS = 500;

export class SqsQueuePublisher extends QueuePublisherProvider {
  private readonly logger = new Logger(SqsQueuePublisher.name);
  private readonly sqsClient: SQSClient;

  /**
   * `redis` stands in for what a standard SQS queue cannot do: ignore a second message with the same `jobId`. Without it every worker replica's
   * `@Cron` tick became its own message (N polls of every location against Google's quota every 15 minutes). Optional so tests and tools
   * can build a publisher without Redis; then ids are not deduplicated.
   */
  constructor(
    private readonly configService: ConfigService<EnvConfig>,
    private readonly redis?: Redis
  ) {
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

    const dedupeKey = options?.jobId ? this.dedupeKey(queueName, options.jobId) : null;
    if (dedupeKey !== null && !(await this.claimJobId(dedupeKey))) {
      this.logger.debug(
        `Skipped job "${jobName}" on "${queueName}": id ${options?.jobId ?? ''} was already published`
      );
      return;
    }

    try {
      await this.send(queueUrl, jobName, data, options);
    } catch (error) {
      // The id was claimed before the send: left in place, one transient SQS error would make every retry and every other replica skip
      // this job as a duplicate for the whole window (for the 15-minute poll fan-out, a lost cycle).
      await this.releaseJobId(dedupeKey);
      throw error;
    }

    this.logger.debug(`Published job "${jobName}" to SQS queue "${queueName}"`);
  }

  private async send<T>(
    queueUrl: string,
    jobName: string,
    data: T,
    options?: PublishOptions
  ): Promise<void> {
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
  }

  private dedupeKey(queueName: QueueName, jobId: string): string {
    return `sqs-publish-dedupe:${queueName}:${jobId}`;
  }

  private async releaseJobId(key: string | null): Promise<void> {
    if (key === null || !this.redis) {
      return;
    }
    try {
      await withTimeout(this.redis.del(key), REDIS_TIMEOUT_MS, 'SQS dedupe release');
    } catch (error) {
      this.logger.warn(
        `Could not release the dedupe key ${key} after a failed send: ${(error as Error).message}`
      );
    }
  }

  /** `false` only when another publisher already took this id. A Redis failure lets the message through: a duplicate beats a lost job. */
  private async claimJobId(key: string): Promise<boolean> {
    if (!this.redis) {
      return true;
    }
    try {
      const claimed = await withTimeout(
        this.redis.set(key, '1', 'EX', SQS_JOB_ID_DEDUPE_SECONDS, 'NX'),
        REDIS_TIMEOUT_MS,
        'SQS dedupe claim'
      );
      return claimed === 'OK';
    } catch (error) {
      this.logger.warn(
        `Could not deduplicate ${key} (publishing anyway): ${(error as Error).message}`
      );
      return true;
    }
  }
}
