import { CronJobName, QueueName } from '@bg/constants/job.constant';

import { CronQueue } from './cron.queue';

describe('CronQueue', () => {
  afterEach(() => jest.useRealTimers());

  const build = () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    return { publish, queue: new CronQueue({ publish } as never) };
  };

  // Regression: each worker replica enqueued its own copy of every tick, so N replicas polled Google N times per interval.
  it('gives two replicas that tick in the same minute the same job id', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T10:00:03Z'));
    const a = build();
    const b = build();

    await a.queue.addReviewSyncPollJob();
    jest.setSystemTime(new Date('2026-10-12T10:00:41Z'));
    await b.queue.addReviewSyncPollJob();

    const idOf = (m: jest.Mock): string =>
      (m.mock.calls[0] as unknown[][])[3]?.['jobId' as never] as string;
    expect(a.publish).toHaveBeenCalledWith(
      QueueName.CRON,
      CronJobName.REVIEW_SYNC_POLL,
      expect.anything(),
      { jobId: expect.stringMatching(/^review-sync-poll-\d+$/) }
    );
    expect(idOf(a.publish)).toBe(idOf(b.publish));
  });

  it('gives the next tick a new id, so a completed job never blocks it', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T10:00:03Z'));
    const { publish, queue } = build();

    await queue.addReviewSyncPollJob();
    jest.setSystemTime(new Date('2026-10-12T10:15:03Z'));
    await queue.addReviewSyncPollJob();

    const ids = publish.mock.calls.map(call => (call[3] as { jobId: string }).jobId);
    expect(new Set(ids).size).toBe(2);
  });

  it('never puts a colon in the id (BullMQ rejects it)', async () => {
    const { publish, queue } = build();

    await queue.addDailyMailJob();

    expect((publish.mock.calls[0]?.[3] as { jobId: string }).jobId).not.toContain(':');
  });
});
