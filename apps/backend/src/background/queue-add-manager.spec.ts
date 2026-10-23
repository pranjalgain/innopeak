import { JobName } from '@bg/constants/job.constant';
import type { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { Logger } from '@nestjs/common';

import { AddingJobsToQueueManager, QUEUE_PUBLISH_TIMEOUT_MS } from './queue-add-manager';

describe('AddingJobsToQueueManager', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // During a Redis outage the producer never rejects, it waits: a sign-up awaiting its code email never answered.
  it('gives up on a publish that never answers, so the caller can report it', async () => {
    const publisher = { publish: jest.fn(() => new Promise(() => undefined)) };
    const manager = new AddingJobsToQueueManager(publisher as unknown as QueuePublisherProvider);

    const adding = manager.addRegisterationOtpEmailJob(JobName.OTP_EMAIL_VERIFICATION, {
      email: 'a@example.com',
      otp: '123456',
    });
    const outcome = expect(adding).rejects.toThrow('did not answer');
    await jest.advanceTimersByTimeAsync(QUEUE_PUBLISH_TIMEOUT_MS + 1);

    await outcome;
  });

  it('resolves once the publish does', async () => {
    const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const manager = new AddingJobsToQueueManager(publisher);

    await expect(
      manager.addRegisterationOtpEmailJob(JobName.OTP_EMAIL_VERIFICATION, {
        email: 'a@example.com',
        otp: '123456',
      })
    ).resolves.toBeUndefined();
  });
});
