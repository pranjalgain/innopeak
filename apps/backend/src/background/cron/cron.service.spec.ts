import { CronJobName } from '@bg/constants/job.constant';
import type { ICronJob } from '@bg/interfaces/job.interface';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ReviewSyncQueue } from '@review-sync-queue/review-sync.queue';

import { CronService } from './cron.service';

describe('CronService', () => {
  let target: CronService;
  let authDbService: jest.Mocked<AuthDbService>;
  let connectionsDbService: jest.Mocked<ConnectionsDbService>;
  let reviewSyncQueue: jest.Mocked<ReviewSyncQueue>;
  let reviewSyncDbService: jest.Mocked<ReviewSyncDbService>;

  beforeEach(async () => {
    authDbService = {
      purgeStaleTokens: jest.fn(),
    } as unknown as jest.Mocked<AuthDbService>;

    connectionsDbService = {
      findLocationsDueForPoll: jest.fn(),
    } as unknown as jest.Mocked<ConnectionsDbService>;

    reviewSyncQueue = {
      addPollJob: jest.fn(),
    } as unknown as jest.Mocked<ReviewSyncQueue>;

    reviewSyncDbService = {
      purgeExpiredReviewerPii: jest.fn(),
    } as unknown as jest.Mocked<ReviewSyncDbService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronService,
        { provide: AuthDbService, useValue: authDbService },
        { provide: ConnectionsDbService, useValue: connectionsDbService },
        { provide: ReviewSyncQueue, useValue: reviewSyncQueue },
        { provide: ReviewSyncDbService, useValue: reviewSyncDbService },
      ],
    }).compile();
    target = module.get(CronService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('sendDailyMail', () => {
    it('logs the daily mail job when data is provided', () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
      const data: ICronJob = { jobType: CronJobName.DAILY_MAIL, data: { foo: 'bar' } };

      expect(() => {
        target.sendDailyMail(data);
      }).not.toThrow();
      expect(debugSpy).toHaveBeenCalledWith('Sending Daily mail', data);
    });

    it('logs the daily mail job when called without data', () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();

      expect(() => {
        target.sendDailyMail();
      }).not.toThrow();
      expect(debugSpy).toHaveBeenCalledWith('Sending Daily mail', undefined);
    });

    it('returns undefined (void, synchronous)', () => {
      jest.spyOn(Logger.prototype, 'debug').mockImplementation();

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- asserting the void return is genuinely `undefined` at runtime is the point of this test
      const result = target.sendDailyMail();

      expect(result).toBeUndefined();
    });
  });

  describe('purgeStaleAuthTokens', () => {
    it('delegates to AuthDbService.purgeStaleTokens and logs the counts', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      authDbService.purgeStaleTokens.mockResolvedValue({ otpTokens: 3, refreshTokens: 12 });

      await target.purgeStaleAuthTokens();

      expect(authDbService.purgeStaleTokens).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('3 stale OTP'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('12 stale refresh'));
    });

    it('propagates a DB failure so the job is retried / lands in the DLQ', async () => {
      authDbService.purgeStaleTokens.mockRejectedValue(new Error('db down'));

      await expect(target.purgeStaleAuthTokens()).rejects.toThrow('db down');
    });
  });

  describe('pollDueLocations', () => {
    it('enqueues one poll job per eligible location, with no syncRunId in the payload', async () => {
      connectionsDbService.findLocationsDueForPoll.mockResolvedValue([
        {
          tenantId: 'tenant-1',
          locationId: 'location-1',
          connectionId: 'connection-1',
          externalAccountId: 'accounts/1',
          externalLocationId: 'locations/1',
        },
        {
          tenantId: 'tenant-2',
          locationId: 'location-2',
          connectionId: 'connection-2',
          externalAccountId: 'accounts/2',
          externalLocationId: 'locations/2',
        },
      ]);

      await target.pollDueLocations();

      expect(reviewSyncQueue.addPollJob).toHaveBeenCalledTimes(2);
      expect(reviewSyncQueue.addPollJob).toHaveBeenNthCalledWith(1, {
        tenantId: 'tenant-1',
        locationId: 'location-1',
        connectionId: 'connection-1',
        externalAccountId: 'accounts/1',
        externalLocationId: 'locations/1',
      });
    });

    it('enqueues nothing when no location is due', async () => {
      connectionsDbService.findLocationsDueForPoll.mockResolvedValue([]);

      await target.pollDueLocations();

      expect(reviewSyncQueue.addPollJob).not.toHaveBeenCalled();
    });

    /**
     * The cron queue is `attempts: 1, removeOnFail: true`, so a throw escaping this loop would
     * drop every *later* location's poll for the cycle with no retry — one transient Redis blip
     * starving every tenant after it in the list.
     */
    it('keeps enqueueing the remaining locations when one enqueue fails', async () => {
      connectionsDbService.findLocationsDueForPoll.mockResolvedValue([
        {
          tenantId: 't1',
          locationId: 'loc-1',
          connectionId: 'c1',
          externalAccountId: 'a1',
          externalLocationId: 'l1',
        },
        {
          tenantId: 't2',
          locationId: 'loc-2',
          connectionId: 'c2',
          externalAccountId: 'a2',
          externalLocationId: 'l2',
        },
        {
          tenantId: 't3',
          locationId: 'loc-3',
          connectionId: 'c3',
          externalAccountId: 'a3',
          externalLocationId: 'l3',
        },
      ]);
      reviewSyncQueue.addPollJob
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('redis unavailable'))
        .mockResolvedValueOnce(undefined);

      await expect(target.pollDueLocations()).resolves.toBeUndefined();

      expect(reviewSyncQueue.addPollJob).toHaveBeenCalledTimes(3);
    });
  });

  describe('purgeExpiredReviewerPii', () => {
    it('delegates to ReviewSyncDbService.purgeExpiredReviewerPii and logs the count', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      reviewSyncDbService.purgeExpiredReviewerPii.mockResolvedValue(7);

      await target.purgeExpiredReviewerPii();

      expect(reviewSyncDbService.purgeExpiredReviewerPii).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Anonymized 7 review'));
    });

    it('propagates a DB failure so the job is retried / lands in the DLQ', async () => {
      reviewSyncDbService.purgeExpiredReviewerPii.mockRejectedValue(new Error('db down'));

      await expect(target.purgeExpiredReviewerPii()).rejects.toThrow('db down');
    });
  });
});
