import { QueueName } from '@bg/constants/job.constant';
import { IDLQFailedJobData } from '@bg/interfaces/job.interface';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor(QueueName.DEAD_LETTER)
export class DeadLetterProcessor extends WorkerHost {
  private readonly logger = new Logger(DeadLetterProcessor.name);

  process(job: Job<IDLQFailedJobData, string, string>): Promise<string> {
    const logString_ = `Processing DLQ job ${job.id} from original queue: ${job.data.originalQueueName}. Original job ID: ${job.data.originalJobId}. Reason: ${job.data.failedReason}`;
    this.logger.error(logString_, 'DeadLetterProcessor');
    if (typeof job.log === 'function') void job.log(logString_);

    // Here you could:
    // - Log to an external error tracking system (e.g., Sentry, LogRocket)
    // - Send a notification (e.g., Slack, email)
    // - Store in a database for easier querying/review
    // - If you want to automatically retry, you'd put that logic here (but typically DLQ is for manual intervention)

    // For now, we'll just log and consider it processed.
    return Promise.resolve('DLQ job processed for review');
  }

  @OnWorkerEvent('active')
  onActive(job: Job): void {
    this.logger.debug(`Job ${job.id} is now active`);
    if (typeof job.log === 'function') void job.log(`Job ${job.id} is now active`);
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job): void {
    this.logger.debug(`Job ${job.id} is ${JSON.stringify(job.progress)}% complete`);
    if (typeof job.log === 'function')
      void job.log(`Job ${job.id} is ${JSON.stringify(job.progress)}% complete`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.debug(`Job ${job.id} has been completed`);
    if (typeof job.log === 'function') void job.log(`Job ${job.id} has been completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job): void {
    const logString_ = `Job ${job.id} has failed with reason: ${job.failedReason}`;
    this.logger.error(logString_);
    this.logger.error(job.stacktrace);
    if (typeof job.log === 'function') void job.log(logString_);
  }

  @OnWorkerEvent('stalled')
  onStalled(job: Job): void {
    this.logger.error(`Job ${job.id} has been stalled`);
    if (typeof job.log === 'function') void job.log(`Job ${job.id} has been stalled`);
  }

  @OnWorkerEvent('error')
  onError(job: Job, error: Error): void {
    const logString_ = `Job ${job.id} has failed with worker error: ${error.message}`;
    this.logger.error(logString_);
    if (typeof job.log === 'function') void job.log(logString_);
  }
}
