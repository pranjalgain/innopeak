import { JobName, QueueName } from '@bg/constants/job.constant';
import { IReviewPostJob } from '@bg/interfaces/job.interface';
import { SqsQueueConsumerBase } from '@bg/providers/sqs-queue-consumer.base';
import { EnvConfig } from '@config/env.config';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReviewPostQueueService } from '@review-post-queue/review-post-queue.service';

@Injectable()
export class ReviewPostSqsConsumer extends SqsQueueConsumerBase {
  protected readonly queueName = QueueName.REVIEW_POST;
  protected readonly logger = new Logger(ReviewPostSqsConsumer.name);

  constructor(
    configService: ConfigService<EnvConfig>,
    private readonly reviewPostQueueService: ReviewPostQueueService,
    private readonly dlqService: DeadLetterQueueService
  ) {
    super(configService);
  }

  protected async process(jobName: string, data: unknown): Promise<void> {
    switch (jobName as JobName) {
      case JobName.REVIEW_POST:
        await this.reviewPostQueueService.postResponse(data as IReviewPostJob);
        break;
      default:
        throw new Error(`Unknown job name: ${jobName}`);
    }
  }

  protected override async onProcessingFailed(
    jobName: string,
    data: unknown,
    error: Error
  ): Promise<void> {
    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.REVIEW_POST,
      originalJobId: '',
      originalJobName: jobName,
      originalJobData: data,
      failedReason: error.message,
      stacktrace: error.stack ? error.stack.split('\n') : [],
      timestamp: Date.now(),
    });
  }
}
