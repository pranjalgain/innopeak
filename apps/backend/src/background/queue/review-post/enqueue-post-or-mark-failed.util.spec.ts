import { MESSAGES } from '@common/constants/messages.constants';
import type { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type { Logger } from '@nestjs/common';

import { enqueuePostOrMarkFailed } from './enqueue-post-or-mark-failed.util';
import type { ReviewPostQueue } from './review-post.queue';

const job = { tenantId: 'tenant-1', reviewId: 'review-1', responseId: 'response-1' };

describe('enqueuePostOrMarkFailed', () => {
  let addPostJob: jest.Mock;
  let markResponsePostFailed: jest.Mock;
  let deps: Parameters<typeof enqueuePostOrMarkFailed>[0];

  beforeEach(() => {
    addPostJob = jest.fn().mockResolvedValue(undefined);
    markResponsePostFailed = jest.fn().mockResolvedValue(null);
    deps = {
      reviewPostQueue: { addPostJob } as unknown as ReviewPostQueue,
      reviewSyncDbService: { markResponsePostFailed } as unknown as ReviewSyncDbService,
      logger: { error: jest.fn() } as unknown as Logger,
    };
  });

  it('queues the job and leaves the response alone', async () => {
    await expect(enqueuePostOrMarkFailed(deps, job)).resolves.toBe(true);

    expect(addPostJob).toHaveBeenCalledWith(job);
    expect(markResponsePostFailed).not.toHaveBeenCalled();
  });

  it('moves the response to post_failed, rather than leaving it approved, when the queue rejects', async () => {
    addPostJob.mockRejectedValue(new Error('redis down'));

    await expect(enqueuePostOrMarkFailed(deps, job)).resolves.toBe(false);

    expect(markResponsePostFailed).toHaveBeenCalledWith({
      responseId: 'response-1',
      errorMessage: MESSAGES.REVIEWS.POST_QUEUE_UNAVAILABLE,
    });
  });

  it('never throws, even if recording post_failed also fails', async () => {
    addPostJob.mockRejectedValue(new Error('redis down'));
    markResponsePostFailed.mockRejectedValue(new Error('db down'));

    await expect(enqueuePostOrMarkFailed(deps, job)).resolves.toBe(false);
  });
});
