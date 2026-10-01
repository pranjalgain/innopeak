import { CronJobName } from '@bg/constants/job.constant';
import type { EnvConfig } from '@config/env.config';
import type { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import type { ConfigService } from '@nestjs/config';

import { CronSqsConsumer } from './cron-sqs.consumer';
import type { CronService } from './cron.service';

describe('CronSqsConsumer', () => {
  let consumer: CronSqsConsumer;
  let cronService: jest.Mocked<CronService>;
  let dlqService: jest.Mocked<DeadLetterQueueService>;

  beforeEach(() => {
    cronService = {
      sendDailyMail: jest.fn(),
      purgeStaleAuthTokens: jest.fn().mockResolvedValue(undefined),
      pollDueLocations: jest.fn().mockResolvedValue(undefined),
      purgeExpiredReviewerPii: jest.fn().mockResolvedValue(undefined),
      purgeErasureRequests: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CronService>;
    dlqService = {
      addFailedJobToDLQ: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DeadLetterQueueService>;
    const configService = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService<EnvConfig>;

    consumer = new CronSqsConsumer(configService, cronService, dlqService);
  });

  describe('process', () => {
    it('dispatches DAILY_MAIL jobs to CronService.sendDailyMail', async () => {
      await consumer.process(CronJobName.DAILY_MAIL, { jobType: CronJobName.DAILY_MAIL });

      expect(cronService.sendDailyMail).toHaveBeenCalledWith({ jobType: CronJobName.DAILY_MAIL });
    });

    it('dispatches AUTH_TOKEN_CLEANUP jobs to CronService.purgeStaleAuthTokens and awaits it', async () => {
      await consumer.process(CronJobName.AUTH_TOKEN_CLEANUP, undefined);

      expect(cronService.purgeStaleAuthTokens).toHaveBeenCalledTimes(1);
    });

    it('dispatches REVIEW_SYNC_POLL jobs to CronService.pollDueLocations and awaits it', async () => {
      await consumer.process(CronJobName.REVIEW_SYNC_POLL, undefined);

      expect(cronService.pollDueLocations).toHaveBeenCalledTimes(1);
    });

    /**
     * The regression this guards: `CronJobName` has four members but this consumer's switch used
     * to handle only three, dropping REVIEWER_RETENTION_PURGE into `default: throw`. Under
     * `DEPLOYMENT_TARGET=aws` that meant the nightly GDPR reviewer-retention purge threw every
     * time, was redriven to the DLQ, and never actually ran — with no crash to surface it.
     */
    it('dispatches REVIEWER_RETENTION_PURGE jobs to CronService.purgeExpiredReviewerPii and awaits it', async () => {
      await consumer.process(CronJobName.REVIEWER_RETENTION_PURGE, undefined);

      expect(cronService.purgeExpiredReviewerPii).toHaveBeenCalledTimes(1);
    });

    it('dispatches ERASURE_PURGE jobs to CronService.purgeErasureRequests and awaits it', async () => {
      await consumer.process(CronJobName.ERASURE_PURGE, undefined);

      expect(cronService.purgeErasureRequests).toHaveBeenCalledTimes(1);
    });

    it('throws on an unrecognized job name rather than silently dropping it', async () => {
      await expect(consumer.process('not-a-real-job', undefined)).rejects.toThrow(
        'Unknown job name: not-a-real-job'
      );
    });
  });

  describe('onProcessingFailed', () => {
    it('forwards the failure to the dead-letter queue', async () => {
      const error = new Error('boom');

      await consumer['onProcessingFailed'](CronJobName.DAILY_MAIL, { a: 1 }, error);

      expect(dlqService.addFailedJobToDLQ).toHaveBeenCalledWith(
        expect.objectContaining({
          originalJobName: CronJobName.DAILY_MAIL,
          originalJobData: { a: 1 },
          failedReason: 'boom',
        })
      );
    });
  });
});
