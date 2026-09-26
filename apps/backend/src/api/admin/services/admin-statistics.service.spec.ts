import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { PlatformAdminAuthUser, TenantAuthUser } from '@auth/types/auth-user.type';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { AdminStatisticsDbService } from '@db/repositories/admin-statistics/admin-statistics.db-service';
import { ForbiddenException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminStatisticsService } from './admin-statistics.service';

describe('AdminStatisticsService', () => {
  let target: AdminStatisticsService;
  let adminStatisticsDbService: { getSummary: jest.Mock };

  const admin: PlatformAdminAuthUser = {
    type: JwtTokenType.PLATFORM_ADMIN,
    id: 'admin-1',
    email: 'admin@innopeak.com',
    locale: null,
  };

  const tenantUser: TenantAuthUser = {
    type: JwtTokenType.TENANT_USER,
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'owner@example.com',
    role: UserRole.OWNER,
    locale: null,
  };

  beforeEach(async () => {
    adminStatisticsDbService = { getSummary: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminStatisticsService,
        { provide: AdminStatisticsDbService, useValue: adminStatisticsDbService },
      ],
    }).compile();

    target = module.get(AdminStatisticsService);
  });

  describe('getSummary', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.getSummary(tenantUser, 6)).rejects.toThrow(ForbiddenException);
      expect(adminStatisticsDbService.getSummary).not.toHaveBeenCalled();
    });

    it('forwards months and maps the summary into a response DTO', async () => {
      adminStatisticsDbService.getSummary.mockResolvedValue({
        replyRatePercent: 75.9,
        avgRating: 4.2,
        syncSuccessRatePercent: 96.4,
        connectionHealth: { connected: 108, needsReauth: 6, disconnected: 4, neverConnected: 10 },
        reviewsTrend: [{ year: 2026, month: 9, reviewsFetched: 812, repliesSent: 640 }],
        ratingDistribution: [
          { rating: 1, count: 92 },
          { rating: 2, count: 140 },
          { rating: 3, count: 310 },
          { rating: 4, count: 980 },
          { rating: 5, count: 2140 },
        ],
        classificationBreakdown: [
          { classification: ReviewClassification.AUTO_REPLY_CANDIDATE, count: 3980 },
          { classification: ReviewClassification.ESCALATED, count: 610 },
          { classification: ReviewClassification.PENDING_CLASSIFICATION, count: 72 },
        ],
      });

      const result = await target.getSummary(admin, 6);

      expect(adminStatisticsDbService.getSummary).toHaveBeenCalledWith(6);
      expect(result.replyRatePercent).toBe(75.9);
      expect(result.avgRating).toBe(4.2);
      expect(result.connectionHealth.connected).toBe(108);
      expect(result.reviewsTrend).toEqual([
        { monthKey: '2026-09', reviewsFetched: 812, repliesSent: 640 },
      ]);
      expect(result.ratingDistribution).toHaveLength(5);
      expect(result.classificationBreakdown).toHaveLength(3);
    });
  });
});
