import { JobName, QueueName } from '@bg/constants/job.constant';

import { ReviewPostQueue } from './review-post.queue';

const job = { tenantId: 'tenant-1', reviewId: 'review-1', responseId: 'response-1' };

describe('ReviewPostQueue', () => {
  const publish = jest.fn().mockResolvedValue(undefined);
  const queue = new ReviewPostQueue({ publish });

  beforeEach(() => publish.mockClear());

  it('publishes immediately by default', async () => {
    await queue.addPostJob(job);

    expect(publish).toHaveBeenCalledWith(
      QueueName.REVIEW_POST,
      JobName.REVIEW_POST,
      job,
      undefined
    );
  });

  it('passes a delay through for a rescheduled attempt', async () => {
    await queue.addPostJob({ ...job, attempt: 2 }, { delayMs: 60_000 });

    expect(publish).toHaveBeenCalledWith(
      QueueName.REVIEW_POST,
      JobName.REVIEW_POST,
      { ...job, attempt: 2 },
      { delayMs: 60_000 }
    );
  });
});
