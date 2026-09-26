import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { PlatformAdminAuthUser, TenantAuthUser } from '@auth/types/auth-user.type';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import { AdminBillingDbService } from '@db/repositories/admin-billing/admin-billing.db-service';
import { ForbiddenException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminBillingService } from './admin-billing.service';

describe('AdminBillingService', () => {
  let target: AdminBillingService;
  let adminBillingDbService: { getSummary: jest.Mock; hasPaidTenants: jest.Mock };

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
    adminBillingDbService = { getSummary: jest.fn(), hasPaidTenants: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminBillingService,
        { provide: AdminBillingDbService, useValue: adminBillingDbService },
      ],
    }).compile();

    target = module.get(AdminBillingService);
  });

  describe('getSummary', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.getSummary(tenantUser, 6)).rejects.toThrow(ForbiddenException);
      expect(adminBillingDbService.getSummary).not.toHaveBeenCalled();
    });

    it('forwards months and maps the summary into a response DTO', async () => {
      adminBillingDbService.getSummary.mockResolvedValue({
        freeCount: 121,
        paidCount: 7,
        activeCount: 6,
        pastDueCount: 1,
        canceledCount: 0,
        incompleteCount: 0,
        cancelingCount: 2,
        upgradeTrend: [{ year: 2026, month: 9, count: 1 }],
        atRisk: [
          {
            tenantId: 'tenant-1',
            businessName: 'The Coastal Table',
            status: SubscriptionStatus.PAST_DUE,
            currentPeriodEnd: '2026-09-01T00:00:00.000Z',
          },
        ],
        recentWebhookEvents: [
          {
            id: 'evt_1',
            type: 'checkout.session.completed',
            processedAt: '2026-09-24T09:27:54.169Z',
          },
        ],
      });

      const result = await target.getSummary(admin, 6);

      expect(adminBillingDbService.getSummary).toHaveBeenCalledWith(6);
      expect(result.freeCount).toBe(121);
      expect(result.paidCount).toBe(7);
      expect(result.upgradeTrend).toEqual([{ monthKey: '2026-09', count: 1 }]);
      expect(result.atRisk).toHaveLength(1);
      expect(result.atRisk[0]?.businessName).toBe('The Coastal Table');
      expect(result.recentWebhookEvents).toHaveLength(1);
      expect(result.recentWebhookEvents[0]?.type).toBe('checkout.session.completed');
    });
  });

  describe('hasPaidTenants', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.hasPaidTenants(tenantUser)).rejects.toThrow(ForbiddenException);
      expect(adminBillingDbService.hasPaidTenants).not.toHaveBeenCalled();
    });

    it('wraps the db-service boolean into the response DTO', async () => {
      adminBillingDbService.hasPaidTenants.mockResolvedValue(true);

      const result = await target.hasPaidTenants(admin);

      expect(result.hasPaidTenants).toBe(true);
    });

    it('reflects false when nothing is on Paid', async () => {
      adminBillingDbService.hasPaidTenants.mockResolvedValue(false);

      const result = await target.hasPaidTenants(admin);

      expect(result.hasPaidTenants).toBe(false);
    });
  });
});
