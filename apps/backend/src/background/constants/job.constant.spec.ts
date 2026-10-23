import { QUEUE_JOB_OPTIONS, QueueName } from './job.constant';

// Written once for both registrations of a queue; they had drifted, and the publishing one used the project defaults.
describe('QUEUE_JOB_OPTIONS', () => {
  it('never blindly retries a review post: its freshness check is the retry', () => {
    expect(QUEUE_JOB_OPTIONS[QueueName.REVIEW_POST].attempts).toBe(1);
  });

  it('runs a cron tick once and keeps no failed one', () => {
    expect(QUEUE_JOB_OPTIONS[QueueName.CRON]).toMatchObject({ attempts: 1, removeOnFail: true });
  });

  // A failed email job's payload held a code; it is removed, not kept for the project default of a week.
  it('keeps no failed email job, and leaves its attempts to each job', () => {
    expect(QUEUE_JOB_OPTIONS[QueueName.EMAIL].removeOnFail).toBe(true);
    expect(QUEUE_JOB_OPTIONS[QueueName.EMAIL].attempts).toBeUndefined();
  });

  it('keeps dead-letter jobs long enough to investigate, and files each only once', () => {
    expect(QUEUE_JOB_OPTIONS[QueueName.DEAD_LETTER]).toMatchObject({
      attempts: 1,
      removeOnFail: { age: 60 * 24 * 3600 },
    });
  });

  it('leaves review-sync on the project defaults: its producer is injected from its own module', () => {
    expect(Object.keys(QUEUE_JOB_OPTIONS)).not.toContain(QueueName.REVIEW_SYNC);
  });
});
