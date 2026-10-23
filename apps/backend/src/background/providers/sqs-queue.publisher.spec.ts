import { QueueName } from '@bg/constants/job.constant';
import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';

import { SqsQueuePublisher } from './sqs-queue.publisher';

const send = jest.fn();
jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send })),
  SendMessageCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

function buildPublisher(redis?: Redis): SqsQueuePublisher {
  const values: Record<string, string> = { REVIEW_POST_QUEUE_URL: 'http://sqs/review-post' };
  return new SqsQueuePublisher(
    {
      get: (key: string) => values[key],
    } as unknown as ConfigService<never>,
    redis
  );
}

describe('SqsQueuePublisher', () => {
  beforeEach(() => send.mockReset().mockResolvedValue({}));

  const sentInput = (): Record<string, unknown> =>
    (send.mock.calls[0]?.[0] as { input: Record<string, unknown> }).input;

  it('maps delayMs to DelaySeconds', async () => {
    await buildPublisher().publish(QueueName.REVIEW_POST, 'job', { a: 1 }, { delayMs: 90_000 });

    expect(sentInput()['DelaySeconds']).toBe(90);
  });

  it('clamps a delay longer than SQS allows to 15 minutes', async () => {
    await buildPublisher().publish(QueueName.REVIEW_POST, 'job', { a: 1 }, { delayMs: 3_600_000 });

    expect(sentInput()['DelaySeconds']).toBe(900);
  });

  it('sends no DelaySeconds when no delay is requested', async () => {
    await buildPublisher().publish(QueueName.REVIEW_POST, 'job', { a: 1 });

    expect(sentInput()).not.toHaveProperty('DelaySeconds');
  });

  // A standard queue cannot ignore a repeated id, so every worker replica's cron tick became its own message.
  describe('job ids', () => {
    const claims = new Set<string>();
    const redis = {
      set: jest.fn((key: string) => {
        if (claims.has(key)) return Promise.resolve(null);
        claims.add(key);
        return Promise.resolve('OK');
      }),
    } as unknown as Redis;

    beforeEach(() => {
      claims.clear();
    });

    it('publishes a job id once, however many replicas publish it', async () => {
      const publisher = buildPublisher(redis);

      await publisher.publish(QueueName.REVIEW_POST, 'job', { a: 1 }, { jobId: 'tick-100' });
      await publisher.publish(QueueName.REVIEW_POST, 'job', { a: 1 }, { jobId: 'tick-100' });
      await publisher.publish(QueueName.REVIEW_POST, 'job', { a: 1 }, { jobId: 'tick-101' });

      expect(send).toHaveBeenCalledTimes(2);
    });

    // Claimed before the send, so a failed send must give the id back or every retry and every other replica skips the job as a duplicate.
    it('releases the id when the send fails, so the next attempt is not skipped as a duplicate', async () => {
      const del = jest.fn().mockResolvedValue(1);
      const publisher = buildPublisher({ ...redis, set: redis.set, del } as unknown as Redis);
      send.mockRejectedValueOnce(new Error('SQS is unavailable'));

      await expect(
        publisher.publish(QueueName.REVIEW_POST, 'job', { a: 1 }, { jobId: 'tick-200' })
      ).rejects.toThrow('SQS is unavailable');
      expect(del).toHaveBeenCalledWith('sqs-publish-dedupe:review-post:tick-200');
    });

    // Redis does not reject while it is down, it never answers: the publish must still go out, and the failed send must still surface.
    it('publishes anyway when Redis never answers', async () => {
      jest.useFakeTimers();
      try {
        const silent = { set: jest.fn(() => new Promise(() => undefined)) } as unknown as Redis;
        const publishing = buildPublisher(silent).publish(
          QueueName.REVIEW_POST,
          'job',
          { a: 1 },
          { jobId: 'tick-300' }
        );
        await jest.advanceTimersByTimeAsync(600);

        await expect(publishing).resolves.toBeUndefined();
        expect(send).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('keeps the same id on another queue apart', async () => {
      const publisher = buildPublisher(redis);
      const values: Record<string, string> = { EMAIL_QUEUE_URL: 'http://sqs/email' };
      const emailPublisher = new SqsQueuePublisher(
        {
          get: (key: string) => values[key] ?? 'http://sqs/review-post',
        } as unknown as ConfigService<never>,
        redis
      );

      await publisher.publish(QueueName.REVIEW_POST, 'job', {}, { jobId: 'same' });
      await emailPublisher.publish(QueueName.EMAIL, 'job', {}, { jobId: 'same' });

      expect(send).toHaveBeenCalledTimes(2);
    });

    it('sends a job with no id every time', async () => {
      const publisher = buildPublisher(redis);

      await publisher.publish(QueueName.REVIEW_POST, 'job', {});
      await publisher.publish(QueueName.REVIEW_POST, 'job', {});

      expect(send).toHaveBeenCalledTimes(2);
    });

    it('publishes anyway when Redis cannot be asked: a duplicate beats a lost job', async () => {
      const broken = {
        set: jest.fn().mockRejectedValue(new Error('redis down')),
      } as unknown as Redis;

      await buildPublisher(broken).publish(QueueName.REVIEW_POST, 'job', {}, { jobId: 'tick-1' });

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('does not deduplicate without a Redis client', async () => {
      const publisher = buildPublisher();

      await publisher.publish(QueueName.REVIEW_POST, 'job', {}, { jobId: 'tick-1' });
      await publisher.publish(QueueName.REVIEW_POST, 'job', {}, { jobId: 'tick-1' });

      expect(send).toHaveBeenCalledTimes(2);
    });
  });
});
