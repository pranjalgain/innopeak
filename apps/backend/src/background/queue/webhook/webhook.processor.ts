import { JobName, QueueName } from '@bg/constants/job.constant';
import { IWebhookDeliveryJob } from '@bg/interfaces/job.interface';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { WebhookQueueService } from './webhook-queue.service';

type WebhookJob = Job<IWebhookDeliveryJob, unknown, JobName>;

@Processor(QueueName.WEBHOOK, {
  concurrency: 5,
  drainDelay: 300,
  stalledInterval: 300000, // 5 minutes
  maxStalledCount: 3,
  limiter: {
    max: 20,
    duration: 1000,
  },
})
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly webhookQueueService: WebhookQueueService,
    private readonly dlqService: DeadLetterQueueService
  ) {
    super();
  }

  async process(job: WebhookJob): Promise<unknown> {
    let logString_ = `Processing webhook delivery job ${job.id} for event ${job.data.event} to ${job.data.url}`;
    this.logger.debug(logString_, 'WebhookProcessor');
    if (typeof job.log === 'function') void job.log(logString_);

    try {
      let result;

      switch (job.name) {
        case JobName.WEBHOOK_DELIVER:
          result = await this.webhookQueueService.deliverWebhook(job.data);
          break;
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }

      logString_ = `Completed webhook delivery job ${job.id} with result ${JSON.stringify(result)}`;
      this.logger.debug(logString_, 'WebhookProcessor');
      if (typeof job.log === 'function') void job.log(logString_);

      return result;
    } catch (error) {
      logString_ = `Failed to process webhook delivery job ${job.id} with error ${(error as Error).message}`;
      this.logger.error(logString_, (error as Error).stack, 'WebhookProcessor');
      if (typeof job.log === 'function') void job.log(logString_);
      throw error;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: WebhookJob): void {
    this.logger.debug(`Webhook job ${job.id} is now active`);
    if (typeof job.log === 'function') void job.log(`Job ${job.id} is now active`);
  }

  @OnWorkerEvent('progress')
  onProgress(job: WebhookJob): void {
    this.logger.debug(`Webhook job ${job.id} is ${JSON.stringify(job.progress)}% complete`);
    if (typeof job.log === 'function')
      void job.log(`Job ${job.id} is ${JSON.stringify(job.progress)}% complete`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: WebhookJob): void {
    this.logger.debug(`Webhook job ${job.id} has been completed`);
    if (typeof job.log === 'function') void job.log(`Job ${job.id} has been completed`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: WebhookJob): Promise<void> {
    const logString_ = `Webhook job ${job.id} has failed with reason: ${job.failedReason}`;
    this.logger.error(logString_, 'WebhookProcessor');
    this.logger.error(job.stacktrace);
    if (typeof job.log === 'function') void job.log(logString_);

    // Push the failed job to the Dead Letter Queue
    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.WEBHOOK,
      originalJobId: job.id ?? '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      timestamp: Date.now(),
    });
  }

  @OnWorkerEvent('stalled')
  async onStalled(job: WebhookJob): Promise<void> {
    this.logger.error(`Webhook job ${job.id} has been stalled`);
    if (typeof job.log === 'function') void job.log(`Job ${job.id} has been stalled`);

    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.WEBHOOK,
      originalJobId: job.id ?? '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: `Job stalled for too long. Current attempts: ${job.attemptsMade}`,
      timestamp: Date.now(),
    });
  }

  @OnWorkerEvent('error')
  async onError(job: WebhookJob, error: Error): Promise<void> {
    const logString_ = `Webhook job ${job.id} has failed with worker error: ${error.message}`;
    this.logger.error(logString_);
    if (typeof job.log === 'function') void job.log(logString_);

    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.WEBHOOK,
      originalJobId: job.id ?? '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: `Processor error: ${error.message}`,
      stacktrace: error.stack ? error.stack.split('\n') : [],
      timestamp: Date.now(),
    });
  }
}
