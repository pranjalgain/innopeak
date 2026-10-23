import { QueueName } from '@bg/constants/job.constant';
import type { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import type { Job } from 'bullmq';

import { ReviewPostProcessor } from './review-post.processor';

describe('ReviewPostProcessor.onFailed', () => {
  const job = {
    id: 'job-1',
    name: 'review-post',
    data: { responseId: 'r-1' },
    failedReason: 'boom',
    stacktrace: ['at x'],
  } as unknown as Job;
  let dlq: { addFailedJobToDLQ: jest.Mock };
  let processor: ReviewPostProcessor;

  beforeEach(() => {
    dlq = { addFailedJobToDLQ: jest.fn().mockResolvedValue(undefined) };
    processor = new ReviewPostProcessor({} as never, dlq as unknown as DeadLetterQueueService);
  });

  it('files every failure in the dead-letter queue', async () => {
    await processor.onFailed(job as never);

    expect(dlq.addFailedJobToDLQ).toHaveBeenCalledWith(
      expect.objectContaining({ originalQueueName: QueueName.REVIEW_POST, originalJobId: 'job-1' })
    );
  });

  // An event handler has no caller: its rejection was unhandled and, by Node's default, ended the worker.
  it('does not reject when the dead-letter write fails', async () => {
    dlq.addFailedJobToDLQ.mockRejectedValue(new Error('redis down'));

    await expect(processor.onFailed(job as never)).resolves.toBeUndefined();
  });
});
