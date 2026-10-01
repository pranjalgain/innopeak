import { AccountAnonymizationService } from '@auth/services/account-anonymization.service';
import { CronJobName } from '@bg/constants/job.constant';
import type { ICronJob } from '@bg/interfaces/job.interface';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import type { AcquireErasureLock } from '@db/repositories/auth/types/auth.type';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  let accountAnonymizationService: jest.Mocked<AccountAnonymizationService>;
  let adminOverviewDbService: jest.Mocked<AdminOverviewDbService>;
  let configService: { get: jest.Mock };
  let acquireLock: jest.Mock;

  beforeEach(async () => {
    acquireLock = jest.fn(
      (_lockKey: string, _resourceId: string, innerFn: () => Promise<unknown>) => innerFn()
    );

    authDbService = {
      purgeStaleTokens: jest.fn(),
      runWithErasurePurgeLock: jest.fn(
        (fn: (acquireLock: AcquireErasureLock) => Promise<unknown>) =>
          fn(acquireLock as unknown as AcquireErasureLock)
      ),
      isTenantStillDueForErasure: jest.fn().mockResolvedValue(true),
      isUserStillDueForErasure: jest.fn().mockResolvedValue(true),
      findTenantsDueForErasurePurge: jest.fn().mockResolvedValue([]),
      findNonAnonymizedUserIdsForTenant: jest.fn().mockResolvedValue([]),
      markTenantErased: jest.fn(),
      findUsersDueForErasurePurge: jest.fn().mockResolvedValue([]),
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

    accountAnonymizationService = {
      anonymizeUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AccountAnonymizationService>;

    adminOverviewDbService = {
      recordActivityBestEffort: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AdminOverviewDbService>;

    configService = { get: jest.fn().mockReturnValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronService,
        { provide: AuthDbService, useValue: authDbService },
        { provide: ConnectionsDbService, useValue: connectionsDbService },
        { provide: ReviewSyncQueue, useValue: reviewSyncQueue },
        { provide: ReviewSyncDbService, useValue: reviewSyncDbService },
        { provide: AccountAnonymizationService, useValue: accountAnonymizationService },
        { provide: AdminOverviewDbService, useValue: adminOverviewDbService },
        { provide: ConfigService, useValue: configService },
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

  describe('purgeErasureRequests', () => {
    it('runs the whole sweep under the session-level erasure-purge lock', async () => {
      await target.purgeErasureRequests();

      expect(authDbService.runWithErasurePurgeLock).toHaveBeenCalledTimes(1);
    });

    it('anonymizes every non-anonymized user in a due tenant before flipping it to erased', async () => {
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table' },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant.mockResolvedValue(['user-1', 'user-2']);
      authDbService.markTenantErased.mockResolvedValue({ name: 'The Coastal Table' });

      await target.purgeErasureRequests();

      expect(authDbService.findNonAnonymizedUserIdsForTenant).toHaveBeenCalledWith('tenant-1');
      expect(accountAnonymizationService.anonymizeUser).toHaveBeenCalledWith('user-1');
      expect(accountAnonymizationService.anonymizeUser).toHaveBeenCalledWith('user-2');
      expect(authDbService.markTenantErased).toHaveBeenCalledWith('tenant-1');
    });

    it('logs BUSINESS_ERASED with no human admin actor once a tenant is fully erased', async () => {
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table' },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant.mockResolvedValue([]);
      authDbService.markTenantErased.mockResolvedValue({ name: 'The Coastal Table' });

      await target.purgeErasureRequests();

      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith(
        expect.objectContaining({
          actorPlatformAdminId: null,
          tenantId: 'tenant-1',
          businessName: 'The Coastal Table',
        })
      );
    });

    it('does not log an activity when the tenant was not actually flipped (already erased)', async () => {
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table' },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant.mockResolvedValue([]);
      authDbService.markTenantErased.mockResolvedValue(null);

      await target.purgeErasureRequests();

      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });

    /**
     * Closes the race this per-tenant lock exists for: the initial `findTenantsDueForErasurePurge`
     * read can be stale by the time the lock is actually acquired (an admin's concurrent
     * `cancelErasure` call, say). Re-verifying under the lock and bailing out — instead of trusting
     * the earlier read — is what stops the cron from anonymizing users of a tenant an admin just
     * un-erased.
     */
    it('takes the per-tenant lock and skips a tenant that is no longer due once re-verified', async () => {
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table' },
      ]);
      authDbService.isTenantStillDueForErasure.mockResolvedValue(false);

      await target.purgeErasureRequests();

      expect(acquireLock).toHaveBeenCalledWith(
        'gdpr:tenant-erasure',
        'tenant-1',
        expect.any(Function)
      );
      expect(authDbService.isTenantStillDueForErasure).toHaveBeenCalledWith('tenant-1', 21);
      expect(authDbService.findNonAnonymizedUserIdsForTenant).not.toHaveBeenCalled();
      expect(authDbService.markTenantErased).not.toHaveBeenCalled();
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });

    /**
     * The standalone member-removal loop gets the exact same per-resource lock + re-verify
     * treatment as the tenant loop above, closing the identical TOCTOU race against a concurrent
     * `cancelMemberRemoval` call for one of these same user ids.
     */
    it('takes the per-member lock and skips a standalone user that is no longer due once re-verified', async () => {
      authDbService.findUsersDueForErasurePurge.mockResolvedValue(['user-3']);
      authDbService.isUserStillDueForErasure.mockResolvedValue(false);

      await target.purgeErasureRequests();

      expect(acquireLock).toHaveBeenCalledWith(
        'gdpr:member-erasure',
        'user-3',
        expect.any(Function)
      );
      expect(authDbService.isUserStillDueForErasure).toHaveBeenCalledWith('user-3', 21);
      expect(accountAnonymizationService.anonymizeUser).not.toHaveBeenCalled();
    });

    it('anonymizes standalone due member removals independent of any tenant erasure', async () => {
      authDbService.findUsersDueForErasurePurge.mockResolvedValue(['user-3']);

      await target.purgeErasureRequests();

      expect(accountAnonymizationService.anonymizeUser).toHaveBeenCalledWith('user-3');
    });

    it('reads the configured grace period rather than a hardcoded default when set', async () => {
      configService.get.mockReturnValue(30);

      await target.purgeErasureRequests();

      expect(authDbService.findTenantsDueForErasurePurge).toHaveBeenCalledWith(30);
      expect(authDbService.findUsersDueForErasurePurge).toHaveBeenCalledWith(30);
    });

    it('defaults the grace period to 21 days when unset', async () => {
      await target.purgeErasureRequests();

      expect(authDbService.findTenantsDueForErasurePurge).toHaveBeenCalledWith(21);
    });
  });
});
