import { JobName } from '@bg/constants/job.constant';
import type { IReviewSyncJob } from '@bg/interfaces/job.interface';
import type { Queue } from 'bullmq';

import { ReviewSyncQueue } from './review-sync.queue';

describe('ReviewSyncQueue.addPollJob', () => {
  const add = jest.fn().mockResolvedValue(undefined);
  const queue = new ReviewSyncQueue({ add } as unknown as Queue);
  const job = { tenantId: 't-1', locationId: 'loc-1', connectionId: 'c-1' } as IReviewSyncJob;

  beforeEach(() => {
    add.mockClear();
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T12:03:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  const optionsOfCall = (n: number): { jobId: string; removeOnComplete: { age: number } } =>
    add.mock.calls[n]?.[2] as { jobId: string; removeOnComplete: { age: number } };

  // A second enqueue of the same tick would poll Google twice.
  it('gives two enqueues in the same ten minutes one id, so BullMQ keeps one job', async () => {
    await queue.addPollJob(job);
    jest.setSystemTime(new Date('2026-10-23T12:08:00Z'));
    await queue.addPollJob(job);

    expect(optionsOfCall(0).jobId).toBe(optionsOfCall(1).jobId);
    expect(optionsOfCall(0).jobId).not.toContain(':');
  });

  it('gives the next tick, and another location, their own ids', async () => {
    await queue.addPollJob(job);
    jest.setSystemTime(new Date('2026-10-23T12:18:00Z'));
    await queue.addPollJob(job);
    await queue.addPollJob({ ...job, locationId: 'loc-2' });

    const ids = [0, 1, 2].map(n => optionsOfCall(n).jobId);
    expect(new Set(ids).size).toBe(3);
  });

  it('drops a completed poll after an hour instead of keeping it for the queue’s week', async () => {
    await queue.addPollJob(job);

    expect(add).toHaveBeenCalledWith(JobName.REVIEW_POLL, job, expect.anything());
    expect(optionsOfCall(0).removeOnComplete).toEqual({ age: 3600 });
  });
});
