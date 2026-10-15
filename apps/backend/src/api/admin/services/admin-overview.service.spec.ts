import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { PlatformAdminAuthUser, TenantAuthUser } from '@auth/types/auth.type';
import { BusinessConnectionStatus } from '@common/enums/business-connection-status.enum';
import { BusinessStatus } from '@common/enums/business-status.enum';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { ForbiddenException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminOverviewService } from './admin-overview.service';

describe('AdminOverviewService', () => {
  let target: AdminOverviewService;
  let adminOverviewDbService: {
    getStats: jest.Mock;
    getRecentBusinesses: jest.Mock;
    getBusinessesNeedingAttention: jest.Mock;
    getSignupTrend: jest.Mock;
    getRecentActivity: jest.Mock;
    listActivity: jest.Mock;
  };

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
    adminOverviewDbService = {
      getStats: jest.fn(),
      getRecentBusinesses: jest.fn(),
      getBusinessesNeedingAttention: jest.fn(),
      getSignupTrend: jest.fn(),
      getRecentActivity: jest.fn(),
      listActivity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOverviewService,
        { provide: AdminOverviewDbService, useValue: adminOverviewDbService },
      ],
    }).compile();

    target = module.get(AdminOverviewService);
  });

  describe('getStats', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.getStats(tenantUser)).rejects.toThrow(ForbiddenException);
      expect(adminOverviewDbService.getStats).not.toHaveBeenCalled();
    });

    it('returns the four stat-card figures', async () => {
      adminOverviewDbService.getStats.mockResolvedValue({
        businessCount: 128,
        userCount: 412,
        totalReviewsFetched: 4821,
        totalRepliesSent: 3660,
      });

      const result = await target.getStats(admin);

      expect(result.businessCount).toBe(128);
      expect(result.userCount).toBe(412);
      expect(result.totalReviewsFetched).toBe(4821);
      expect(result.totalRepliesSent).toBe(3660);
    });

    // Platform-wide counts are full table scans, so repeat page loads are served from memory for a short while.
    it('serves repeat calls from the cache instead of rescanning', async () => {
      adminOverviewDbService.getStats.mockResolvedValue({
        businessCount: 1,
        userCount: 2,
        totalReviewsFetched: 3,
        totalRepliesSent: 4,
      });

      await target.getStats(admin);
      await target.getStats(admin);

      expect(adminOverviewDbService.getStats).toHaveBeenCalledTimes(1);
    });

    it('checks the caller is a platform admin even when the answer is cached', async () => {
      adminOverviewDbService.getStats.mockResolvedValue({
        businessCount: 1,
        userCount: 2,
        totalReviewsFetched: 3,
        totalRepliesSent: 4,
      });
      await target.getStats(admin);

      await expect(target.getStats(tenantUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getRecentBusinesses', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.getRecentBusinesses(tenantUser, 5)).rejects.toThrow(ForbiddenException);
      expect(adminOverviewDbService.getRecentBusinesses).not.toHaveBeenCalled();
    });

    it('maps summaries into response DTOs, forwarding the limit', async () => {
      adminOverviewDbService.getRecentBusinesses.mockResolvedValue([
        {
          id: 'tenant-1',
          name: 'The Coastal Table',
          status: BusinessStatus.ACTIVE,
          connectionStatus: BusinessConnectionStatus.CONNECTED,
          ownerName: 'Maria Delgado',
          ownerEmail: 'maria@coastaltable.com',
          userCount: 4,
          createdAt: '2026-09-11T09:00:00.000Z',
        },
      ]);

      const result = await target.getRecentBusinesses(admin, 5);

      expect(adminOverviewDbService.getRecentBusinesses).toHaveBeenCalledWith(5);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('The Coastal Table');
    });
  });

  describe('getNeedsAttention', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.getNeedsAttention(tenantUser, 3)).rejects.toThrow(ForbiddenException);
      expect(adminOverviewDbService.getBusinessesNeedingAttention).not.toHaveBeenCalled();
    });

    it('maps whatever the DB service already filtered/ordered/capped', async () => {
      const disconnected = {
        id: 'tenant-disconnected',
        name: 'Oak & Iron Hardware',
        status: BusinessStatus.ACTIVE,
        connectionStatus: BusinessConnectionStatus.DISCONNECTED,
        ownerName: 'Priya Shah',
        ownerEmail: 'priya@oakandiron.com',
        userCount: 2,
        createdAt: '2026-08-02T09:00:00.000Z',
      };
      const neverConnected = {
        id: 'tenant-never',
        name: 'New Signup Co',
        status: BusinessStatus.ACTIVE,
        connectionStatus: BusinessConnectionStatus.NEVER_CONNECTED,
        ownerName: 'Alex Newman',
        ownerEmail: 'alex@newsignup.com',
        userCount: 1,
        createdAt: '2026-09-20T09:00:00.000Z',
      };
      adminOverviewDbService.getBusinessesNeedingAttention.mockResolvedValue([
        disconnected,
        neverConnected,
      ]);

      const result = await target.getNeedsAttention(admin, 3);

      expect(adminOverviewDbService.getBusinessesNeedingAttention).toHaveBeenCalledWith(3);
      expect(result.map(business => business.id)).toEqual(['tenant-disconnected', 'tenant-never']);
    });
  });

  describe('getSignupTrend', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.getSignupTrend(tenantUser, 6)).rejects.toThrow(ForbiddenException);
      expect(adminOverviewDbService.getSignupTrend).not.toHaveBeenCalled();
    });

    it('fills zero-signup months into the window before mapping to DTOs', async () => {
      const now = new Date();
      const currentYear = now.getUTCFullYear();
      const currentMonth = now.getUTCMonth() + 1;

      adminOverviewDbService.getSignupTrend.mockResolvedValue([
        { year: currentYear, month: currentMonth, count: 4 },
      ]);

      const result = await target.getSignupTrend(admin, 6);

      expect(adminOverviewDbService.getSignupTrend).toHaveBeenCalledWith(6);
      expect(result).toHaveLength(6);
      expect(result.filter(point => point.count === 0)).toHaveLength(5);
      expect(result[result.length - 1]?.count).toBe(4);
    });

    it('caches each month window separately', async () => {
      adminOverviewDbService.getSignupTrend.mockResolvedValue([]);

      await target.getSignupTrend(admin, 6);
      await target.getSignupTrend(admin, 6);
      await target.getSignupTrend(admin, 12);

      expect(adminOverviewDbService.getSignupTrend).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRecentActivity', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.getRecentActivity(tenantUser, 5)).rejects.toThrow(ForbiddenException);
      expect(adminOverviewDbService.getRecentActivity).not.toHaveBeenCalled();
    });

    it('returns the newest rows of the activity log as they are, including a business joining and a settings change', async () => {
      adminOverviewDbService.getRecentActivity.mockResolvedValue([
        {
          id: 'activity-3',
          type: PlatformActivityType.PLATFORM_SETTINGS_CHANGED,
          actorEmail: 'admin@innopeak.com',
          businessName: null,
          targetEmail: null,
          details: { changes: [{ field: 'googleLoginEnabled', from: true, to: false }] },
          occurredAt: '2026-09-12T09:00:00.000Z',
        },
        {
          id: 'activity-2',
          type: PlatformActivityType.BUSINESS_JOINED,
          actorEmail: 'maria@coastaltable.com',
          businessName: 'The Coastal Table',
          targetEmail: null,
          details: null,
          occurredAt: '2026-09-11T09:00:00.000Z',
        },
        {
          id: 'activity-1',
          type: PlatformActivityType.BUSINESS_SUSPENDED,
          actorEmail: 'admin@innopeak.com',
          businessName: 'Oak & Iron Hardware',
          targetEmail: null,
          details: null,
          occurredAt: '2026-09-10T09:00:00.000Z',
        },
      ]);

      const result = await target.getRecentActivity(admin, 5);

      expect(adminOverviewDbService.getRecentActivity).toHaveBeenCalledWith(5);
      // The log is the one source: nothing is synthesized from the businesses list any more.
      expect(adminOverviewDbService.getRecentBusinesses).not.toHaveBeenCalled();
      expect(result.map(entry => entry.type)).toEqual([
        PlatformActivityType.PLATFORM_SETTINGS_CHANGED,
        PlatformActivityType.BUSINESS_JOINED,
        PlatformActivityType.BUSINESS_SUSPENDED,
      ]);
      expect(result[0]?.details).toEqual({
        changes: [{ field: 'googleLoginEnabled', from: true, to: false }],
      });
      expect(result[1]).toMatchObject({
        actorEmail: 'maria@coastaltable.com',
        businessName: 'The Coastal Table',
        details: null,
      });
    });
  });

  describe('listActivity', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.listActivity(tenantUser, {})).rejects.toThrow(ForbiddenException);
      expect(adminOverviewDbService.listActivity).not.toHaveBeenCalled();
    });

    it('defaults page/pageSize and maps rows + pagination meta', async () => {
      adminOverviewDbService.listActivity.mockResolvedValue({
        activities: [
          {
            id: 'activity-1',
            type: PlatformActivityType.BUSINESS_SUSPENDED,
            actorEmail: 'admin@innopeak.com',
            businessName: 'Oak & Iron Hardware',
            targetEmail: null,
            details: null,
            occurredAt: '2026-09-11T09:00:00.000Z',
          },
        ],
        total: 1,
      });

      const result = await target.listActivity(admin, {});

      expect(adminOverviewDbService.listActivity).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        type: undefined,
      });
      expect(result.activities).toHaveLength(1);
      expect(result.activities[0]?.businessName).toBe('Oak & Iron Hardware');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    it('forwards page/pageSize/type and computes totalPages', async () => {
      adminOverviewDbService.listActivity.mockResolvedValue({ activities: [], total: 45 });

      const result = await target.listActivity(admin, {
        page: 2,
        pageSize: 20,
        type: PlatformActivityType.USER_DEACTIVATED,
      });

      expect(adminOverviewDbService.listActivity).toHaveBeenCalledWith({
        page: 2,
        pageSize: 20,
        type: PlatformActivityType.USER_DEACTIVATED,
      });
      expect(result.meta).toEqual({ page: 2, pageSize: 20, total: 45, totalPages: 3 });
    });
  });
});
