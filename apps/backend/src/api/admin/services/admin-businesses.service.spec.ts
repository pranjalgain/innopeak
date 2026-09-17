import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { PlatformAdminAuthUser, TenantAuthUser } from '@auth/types/auth-user.type';
import { BusinessConnectionStatus } from '@common/enums/business-connection-status.enum';
import { BusinessStatus } from '@common/enums/business-status.enum';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { AdminBusinessesDbService } from '@db/repositories/admin-businesses/admin-businesses.db-service';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminBusinessesService } from './admin-businesses.service';

describe('AdminBusinessesService', () => {
  let target: AdminBusinessesService;
  let adminBusinessesDbService: { findAll: jest.Mock; setStatus: jest.Mock };
  let adminOverviewDbService: { recordActivityBestEffort: jest.Mock };

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

  const summary = {
    id: 'tenant-1',
    name: 'The Coastal Table',
    status: BusinessStatus.ACTIVE,
    connectionStatus: BusinessConnectionStatus.CONNECTED,
    ownerName: 'Maria Delgado',
    ownerEmail: 'maria@coastaltable.com',
    userCount: 4,
    createdAt: '2025-11-02T09:00:00.000Z',
  };

  beforeEach(async () => {
    adminBusinessesDbService = { findAll: jest.fn(), setStatus: jest.fn() };
    adminOverviewDbService = { recordActivityBestEffort: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminBusinessesService,
        { provide: AdminBusinessesDbService, useValue: adminBusinessesDbService },
        { provide: AdminOverviewDbService, useValue: adminOverviewDbService },
      ],
    }).compile();

    target = module.get(AdminBusinessesService);
  });

  describe('list', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.list(tenantUser)).rejects.toThrow(ForbiddenException);
      expect(adminBusinessesDbService.findAll).not.toHaveBeenCalled();
    });

    it('lists every business', async () => {
      adminBusinessesDbService.findAll.mockResolvedValue([summary]);

      const result = await target.list(admin);

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('The Coastal Table');
    });
  });

  describe('setStatus', () => {
    it('maps BusinessStatus.SUSPENDED to the real TenantStatus.SUSPENDED and logs the activity', async () => {
      adminBusinessesDbService.setStatus.mockResolvedValue({
        ...summary,
        status: BusinessStatus.SUSPENDED,
      });

      await target.setStatus(admin, { tenantId: 'tenant-1', status: BusinessStatus.SUSPENDED });

      expect(adminBusinessesDbService.setStatus).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        status: TenantStatus.SUSPENDED,
      });
      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith({
        type: PlatformActivityType.BUSINESS_SUSPENDED,
        actorPlatformAdminId: 'admin-1',
        actorEmail: 'admin@innopeak.com',
        tenantId: 'tenant-1',
        businessName: 'The Coastal Table',
      });
    });

    /**
     * Reactivating always lands on the real `TenantStatus.ACTIVE`, never `pending_activation` —
     * both collapse to the same displayed `BusinessStatus.ACTIVE` anyway, so there is nothing to
     * preserve by branching on whichever the tenant was in before suspension.
     */
    it('maps BusinessStatus.ACTIVE to the real TenantStatus.ACTIVE and logs the activity', async () => {
      adminBusinessesDbService.setStatus.mockResolvedValue(summary);

      await target.setStatus(admin, { tenantId: 'tenant-1', status: BusinessStatus.ACTIVE });

      expect(adminBusinessesDbService.setStatus).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        status: TenantStatus.ACTIVE,
      });
      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith({
        type: PlatformActivityType.BUSINESS_REACTIVATED,
        actorPlatformAdminId: 'admin-1',
        actorEmail: 'admin@innopeak.com',
        tenantId: 'tenant-1',
        businessName: 'The Coastal Table',
      });
    });

    it('throws 404 when no such tenant exists, without logging any activity', async () => {
      adminBusinessesDbService.setStatus.mockResolvedValue(null);

      await expect(
        target.setStatus(admin, { tenantId: 'missing', status: BusinessStatus.ACTIVE })
      ).rejects.toThrow(NotFoundException);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });
  });
});
