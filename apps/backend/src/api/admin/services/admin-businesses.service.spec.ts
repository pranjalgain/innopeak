import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { PlatformAdminAuthUser, TenantAuthUser } from '@auth/types/auth.type';
import { BusinessConnectionStatus } from '@common/enums/business-connection-status.enum';
import { BusinessStatus } from '@common/enums/business-status.enum';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { AdminBusinessesDbService } from '@db/repositories/admin-businesses/admin-businesses.db-service';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminBusinessesService } from './admin-businesses.service';

describe('AdminBusinessesService', () => {
  let target: AdminBusinessesService;
  let adminBusinessesDbService: {
    findAll: jest.Mock;
    setStatus: jest.Mock;
    requestErasure: jest.Mock;
    cancelErasure: jest.Mock;
  };
  let adminOverviewDbService: { recordActivityBestEffort: jest.Mock };
  let configService: { get: jest.Mock };

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

  const summary = {
    id: 'tenant-1',
    name: 'The Coastal Table',
    status: BusinessStatus.ACTIVE,
    connectionStatus: BusinessConnectionStatus.CONNECTED,
    ownerName: 'Maria Delgado',
    ownerEmail: 'maria@coastaltable.com',
    userCount: 4,
    createdAt: '2025-11-02T09:00:00.000Z',
    erasureRequestedAt: null,
  };

  beforeEach(async () => {
    adminBusinessesDbService = {
      findAll: jest.fn(),
      setStatus: jest.fn(),
      requestErasure: jest.fn(),
      cancelErasure: jest.fn(),
    };
    adminOverviewDbService = { recordActivityBestEffort: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminBusinessesService,
        { provide: AdminBusinessesDbService, useValue: adminBusinessesDbService },
        { provide: AdminOverviewDbService, useValue: adminOverviewDbService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    target = module.get(AdminBusinessesService);
  });

  describe('list', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.list(tenantUser, {})).rejects.toThrow(ForbiddenException);
      expect(adminBusinessesDbService.findAll).not.toHaveBeenCalled();
    });

    it('lists every business', async () => {
      adminBusinessesDbService.findAll.mockResolvedValue([summary]);

      const result = await target.list(admin, {});

      expect(adminBusinessesDbService.findAll).toHaveBeenCalledWith(undefined);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('The Coastal Table');
    });

    it('forwards the search term to the db service', async () => {
      adminBusinessesDbService.findAll.mockResolvedValue([summary]);

      await target.list(admin, { search: 'coastal' });

      expect(adminBusinessesDbService.findAll).toHaveBeenCalledWith('coastal');
    });
  });

  describe('setStatus', () => {
    it('maps BusinessStatus.SUSPENDED to the real TenantStatus.SUSPENDED and logs the activity', async () => {
      adminBusinessesDbService.setStatus.mockResolvedValue({
        outcome: 'updated',
        summary: { ...summary, status: BusinessStatus.SUSPENDED },
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
      adminBusinessesDbService.setStatus.mockResolvedValue({ outcome: 'updated', summary });

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
      adminBusinessesDbService.setStatus.mockResolvedValue({ outcome: 'not_found' });

      await expect(
        target.setStatus(admin, { tenantId: 'missing', status: BusinessStatus.ACTIVE })
      ).rejects.toThrow(NotFoundException);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });

    it('throws 409 when the tenant has a pending erasure request, without logging any activity', async () => {
      adminBusinessesDbService.setStatus.mockResolvedValue({ outcome: 'erasure_pending' });

      await expect(
        target.setStatus(admin, { tenantId: 'tenant-1', status: BusinessStatus.SUSPENDED })
      ).rejects.toThrow(ConflictException);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });
  });

  describe('requestErasure', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.requestErasure(tenantUser, 'tenant-1')).rejects.toThrow(
        ForbiddenException
      );
      expect(adminBusinessesDbService.requestErasure).not.toHaveBeenCalled();
    });

    it('requests erasure, logs the activity, and reports the configured grace period', async () => {
      adminBusinessesDbService.requestErasure.mockResolvedValue({
        ...summary,
        status: BusinessStatus.SUSPENDED,
        erasureRequestedAt: '2026-03-05T09:12:00.000Z',
      });
      configService.get.mockReturnValue(30);

      const result = await target.requestErasure(admin, 'tenant-1');

      expect(adminBusinessesDbService.requestErasure).toHaveBeenCalledWith('tenant-1');
      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith({
        type: PlatformActivityType.BUSINESS_ERASURE_REQUESTED,
        actorPlatformAdminId: 'admin-1',
        actorEmail: 'admin@innopeak.com',
        tenantId: 'tenant-1',
        businessName: 'The Coastal Table',
      });
      expect(result.gracePeriodDays).toBe(30);
      expect(result.business.erasureRequestedAt).toBe('2026-03-05T09:12:00.000Z');
    });

    it('defaults the grace period to 21 days when unset', async () => {
      adminBusinessesDbService.requestErasure.mockResolvedValue(summary);

      const result = await target.requestErasure(admin, 'tenant-1');

      expect(result.gracePeriodDays).toBe(21);
    });

    it('throws 404 when no such tenant exists (or it is already erased), without logging any activity', async () => {
      adminBusinessesDbService.requestErasure.mockResolvedValue(null);

      await expect(target.requestErasure(admin, 'missing')).rejects.toThrow(NotFoundException);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });
  });

  describe('cancelErasure', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.cancelErasure(tenantUser, 'tenant-1')).rejects.toThrow(
        ForbiddenException
      );
      expect(adminBusinessesDbService.cancelErasure).not.toHaveBeenCalled();
    });

    it('cancels erasure and logs the activity', async () => {
      adminBusinessesDbService.cancelErasure.mockResolvedValue(summary);

      await target.cancelErasure(admin, 'tenant-1');

      expect(adminBusinessesDbService.cancelErasure).toHaveBeenCalledWith('tenant-1');
      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith({
        type: PlatformActivityType.BUSINESS_ERASURE_CANCELLED,
        actorPlatformAdminId: 'admin-1',
        actorEmail: 'admin@innopeak.com',
        tenantId: 'tenant-1',
        businessName: 'The Coastal Table',
      });
    });

    it('throws 404 when no such tenant exists, without logging any activity', async () => {
      adminBusinessesDbService.cancelErasure.mockResolvedValue(null);

      await expect(target.cancelErasure(admin, 'missing')).rejects.toThrow(NotFoundException);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });
  });
});
