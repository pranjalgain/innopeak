import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { PlatformAdminAuthUser, TenantAuthUser } from '@auth/types/auth-user.type';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { ForbiddenException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminOverviewService } from './admin-overview.service';

describe('AdminOverviewService', () => {
  let target: AdminOverviewService;
  let adminOverviewDbService: { getReviewStats: jest.Mock; getRecentActivity: jest.Mock };

  const admin: PlatformAdminAuthUser = {
    type: JwtTokenType.PLATFORM_ADMIN,
    id: 'admin-1',
    email: 'admin@innopeak.com',
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
    adminOverviewDbService = { getReviewStats: jest.fn(), getRecentActivity: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOverviewService,
        { provide: AdminOverviewDbService, useValue: adminOverviewDbService },
      ],
    }).compile();

    target = module.get(AdminOverviewService);
  });

  describe('getReviewStats', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.getReviewStats(tenantUser)).rejects.toThrow(ForbiddenException);
      expect(adminOverviewDbService.getReviewStats).not.toHaveBeenCalled();
    });

    it('returns platform-wide review throughput', async () => {
      adminOverviewDbService.getReviewStats.mockResolvedValue({
        totalReviewsFetched: 4821,
        totalRepliesSent: 3660,
      });

      const result = await target.getReviewStats(admin);

      expect(result.totalReviewsFetched).toBe(4821);
      expect(result.totalRepliesSent).toBe(3660);
    });
  });

  describe('getRecentActivity', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.getRecentActivity(tenantUser, 5)).rejects.toThrow(ForbiddenException);
      expect(adminOverviewDbService.getRecentActivity).not.toHaveBeenCalled();
    });

    it('maps rows into response DTOs, forwarding the limit', async () => {
      adminOverviewDbService.getRecentActivity.mockResolvedValue([
        {
          id: 'activity-1',
          type: PlatformActivityType.BUSINESS_SUSPENDED,
          actorEmail: 'admin@innopeak.com',
          businessName: 'Oak & Iron Hardware',
          targetEmail: null,
          occurredAt: '2026-09-11T09:00:00.000Z',
        },
      ]);

      const result = await target.getRecentActivity(admin, 5);

      expect(adminOverviewDbService.getRecentActivity).toHaveBeenCalledWith(5);
      expect(result).toHaveLength(1);
      expect(result[0]?.businessName).toBe('Oak & Iron Hardware');
      expect(result[0]?.email).toBeNull();
    });
  });
});
