import { AdminBusinessesDbService } from '@db/repositories/admin-businesses/admin-businesses.db-service';
import { AdminUsersDbService } from '@db/repositories/admin-users/admin-users.db-service';
import { Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminOverviewDbService } from './admin-overview.db-service';
import { AdminOverviewRepository } from './admin-overview.repository';

describe('AdminOverviewDbService', () => {
  let target: AdminOverviewDbService;
  let adminOverviewRepository: { getReviewStats: jest.Mock; getSignupTrend: jest.Mock };
  let adminBusinessesDbService: { count: jest.Mock; findRecent: jest.Mock };
  let adminUsersDbService: { count: jest.Mock };

  beforeEach(async () => {
    adminOverviewRepository = { getReviewStats: jest.fn(), getSignupTrend: jest.fn() };
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
