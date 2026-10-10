import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { AdminBusinessesDbService } from '@db/repositories/admin-businesses/admin-businesses.db-service';
import { AdminUsersDbService } from '@db/repositories/admin-users/admin-users.db-service';
import { Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Counter } from 'prom-client';
import { register } from 'prom-client';

import { AdminOverviewDbService } from './admin-overview.db-service';
import { AdminOverviewRepository } from './admin-overview.repository';

describe('AdminOverviewDbService', () => {
  let target: AdminOverviewDbService;
  let adminOverviewRepository: {
    getReviewStats: jest.Mock;
    getSignupTrend: jest.Mock;
    recordActivity: jest.Mock;
  };
  let adminBusinessesDbService: { count: jest.Mock; findRecent: jest.Mock };
  let adminUsersDbService: { count: jest.Mock };

  beforeEach(async () => {
    adminOverviewRepository = {
      getReviewStats: jest.fn(),
      getSignupTrend: jest.fn(),
      recordActivity: jest.fn(),
    };
    adminBusinessesDbService = { count: jest.fn(), findRecent: jest.fn() };
    adminUsersDbService = { count: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOverviewDbService,
        { provide: AdminOverviewRepository, useValue: adminOverviewRepository },
        { provide: AdminBusinessesDbService, useValue: adminBusinessesDbService },
        { provide: AdminUsersDbService, useValue: adminUsersDbService },
      ],
    }).compile();

    target = module.get(AdminOverviewDbService);
  });

  describe('getStats', () => {
    it('composes the business count, user count and review stats into one object', async () => {
      adminBusinessesDbService.count.mockResolvedValue(128);
      adminUsersDbService.count.mockResolvedValue(412);
      adminOverviewRepository.getReviewStats.mockResolvedValue({
        totalReviewsFetched: 4821,
        totalRepliesSent: 3660,
      });

      const result = await target.getStats();

      expect(result).toEqual({
        businessCount: 128,
        userCount: 412,
        totalReviewsFetched: 4821,
        totalRepliesSent: 3660,
      });
    });

    it('defaults the business count to 0 and logs a warning when it rejects, without affecting the other sources', async () => {
      const loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      adminBusinessesDbService.count.mockRejectedValue(new Error('connection reset'));
      adminUsersDbService.count.mockResolvedValue(412);
      adminOverviewRepository.getReviewStats.mockResolvedValue({
        totalReviewsFetched: 4821,
        totalRepliesSent: 3660,
      });

      const result = await target.getStats();

      expect(result).toEqual({
        businessCount: 0,
        userCount: 412,
        totalReviewsFetched: 4821,
        totalRepliesSent: 3660,
      });
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('business count'),
        expect.any(String)
      );
      loggerWarnSpy.mockRestore();
    });

    it('defaults the user count to 0 and logs a warning when it rejects, without affecting the other sources', async () => {
      const loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      adminBusinessesDbService.count.mockResolvedValue(128);
      adminUsersDbService.count.mockRejectedValue(new Error('connection reset'));
      adminOverviewRepository.getReviewStats.mockResolvedValue({
        totalReviewsFetched: 4821,
        totalRepliesSent: 3660,
      });

      const result = await target.getStats();

      expect(result).toEqual({
        businessCount: 128,
        userCount: 0,
        totalReviewsFetched: 4821,
        totalRepliesSent: 3660,
      });
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('user count'),
        expect.any(String)
      );
      loggerWarnSpy.mockRestore();
    });

    it('defaults both review-stat fields to 0 and logs a warning when the review-stats source rejects, without affecting the other sources', async () => {
      const loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      adminBusinessesDbService.count.mockResolvedValue(128);
      adminUsersDbService.count.mockResolvedValue(412);
      adminOverviewRepository.getReviewStats.mockRejectedValue(new Error('query timed out'));

      const result = await target.getStats();

      expect(result).toEqual({
        businessCount: 128,
        userCount: 412,
        totalReviewsFetched: 0,
        totalRepliesSent: 0,
      });
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('review stats'),
        expect.any(String)
      );
      loggerWarnSpy.mockRestore();
    });
  });

  // The feed must not silently lose entries: transient failures are retried, bad data is trimmed, and a drop is counted.
  describe('recordActivityBestEffort', () => {
    const entry = {
      type: PlatformActivityType.BUSINESS_SUSPENDED,
      actorPlatformAdminId: 'admin-1',
      actorEmail: 'root@innopeak.test',
      tenantId: 'tenant-1',
      businessName: 'Coastal Table',
    };
    const droppedCount = async (): Promise<number> => {
      const metric = register.getSingleMetric('platform_activity_dropped_total') as Counter<'type'>;
      const values = (await metric.get()).values;
      return values.reduce((sum, value) => sum + value.value, 0);
    };

    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('records the entry on the first try', async () => {
      adminOverviewRepository.recordActivity.mockResolvedValue(undefined);

      await target.recordActivityBestEffort(entry);

      expect(adminOverviewRepository.recordActivity).toHaveBeenCalledTimes(1);
    });

    it('retries a transient failure and records the entry', async () => {
      adminOverviewRepository.recordActivity
        .mockRejectedValueOnce(new Error('connection terminated'))
        .mockResolvedValueOnce(undefined);

      const done = target.recordActivityBestEffort(entry);
      await jest.runAllTimersAsync();
      await done;

      expect(adminOverviewRepository.recordActivity).toHaveBeenCalledTimes(2);
    });

    it('gives up after three attempts, counts the drop and logs the payload for replay', async () => {
      adminOverviewRepository.recordActivity.mockRejectedValue(new Error('db down'));
      const before = await droppedCount();

      const done = target.recordActivityBestEffort(entry);
      await jest.runAllTimersAsync();
      await expect(done).resolves.toBeUndefined();

      expect(adminOverviewRepository.recordActivity).toHaveBeenCalledTimes(3);
      expect(await droppedCount()).toBe(before + 1);
      const logged = (Logger.prototype.error as jest.Mock).mock.calls.map(call => String(call[0]));
      expect(
        logged.some(
          line => line.includes('Payload for manual replay') && line.includes('Coastal Table')
        )
      ).toBe(true);
    });

    // Retrying a statement that is wrong for this data only repeats the failure.
    it('does not retry an integrity or data error', async () => {
      adminOverviewRepository.recordActivity.mockRejectedValue(
        Object.assign(new Error('violates foreign key'), { code: '23503' })
      );

      await target.recordActivityBestEffort(entry);

      expect(adminOverviewRepository.recordActivity).toHaveBeenCalledTimes(1);
    });

    it('trims values longer than their VARCHAR(255) columns instead of failing the insert', async () => {
      adminOverviewRepository.recordActivity.mockResolvedValue(undefined);

      await target.recordActivityBestEffort({ ...entry, businessName: 'x'.repeat(400) });

      const written = adminOverviewRepository.recordActivity.mock.calls[0]?.[0] as {
        businessName: string;
      };
      expect(written.businessName).toHaveLength(255);
    });
  });

  describe('getRecentBusinesses', () => {
    it('forwards the limit to AdminBusinessesDbService.findRecent', async () => {
      adminBusinessesDbService.findRecent.mockResolvedValue([]);

      await target.getRecentBusinesses(5);

      expect(adminBusinessesDbService.findRecent).toHaveBeenCalledWith(5);
    });
  });

  describe('getSignupTrend', () => {
    it('forwards the month window to the repository', async () => {
      adminOverviewRepository.getSignupTrend.mockResolvedValue([]);

      await target.getSignupTrend(6);

      expect(adminOverviewRepository.getSignupTrend).toHaveBeenCalledWith(6);
    });
  });
});
