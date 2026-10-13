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

  /**
   * BullMQ emits `(jobId, previousState)` here, not the job. A stalled job is either re-queued (the worker that held its lock
   * died) or, past `maxStalledCount`, failed, which the `failed` handler already forwards to the dead-letter queue, so this only
   * logs: writing it to the DLQ as well filed a job that was about to be retried, with an empty id, name and payload.
   */
  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.error(`Job ${jobId} has been stalled`);
  }

  /** Worker-level errors (a lost Redis connection) carry no job: BullMQ emits `(error)` only. */
  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error(`Worker error: ${error.message}`);
  }
}
