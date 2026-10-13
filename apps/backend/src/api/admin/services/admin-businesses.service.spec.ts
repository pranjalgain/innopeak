import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { ErasureNoticeService } from '@auth/services/erasure-notice.service';
import type { PlatformAdminAuthUser, TenantAuthUser } from '@auth/types/auth.type';
import { BillingReconciliationService } from '@billing/services/billing-reconciliation.service';
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
    findPage: jest.Mock;
    setStatus: jest.Mock;
    requestErasure: jest.Mock;
    cancelErasure: jest.Mock;
  };
  let adminOverviewDbService: { recordActivityBestEffort: jest.Mock };
  let billingReconciliationService: {
    scheduleCancellationForErasure: jest.Mock;
    resumeAfterErasureCancelled: jest.Mock;
  };
  let erasureNoticeService: { notifyScheduled: jest.Mock; notifyCancelled: jest.Mock };
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
      findPage: jest.fn(),
      setStatus: jest.fn(),
      requestErasure: jest.fn(),
      cancelErasure: jest.fn(),
    };
    adminOverviewDbService = { recordActivityBestEffort: jest.fn() };
    billingReconciliationService = {
      scheduleCancellationForErasure: jest.fn().mockResolvedValue(undefined),
      resumeAfterErasureCancelled: jest.fn().mockResolvedValue(undefined),
    };
    erasureNoticeService = {
      notifyScheduled: jest.fn().mockResolvedValue(undefined),
      notifyCancelled: jest.fn().mockResolvedValue(undefined),
    };
    configService = { get: jest.fn().mockReturnValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminBusinessesService,
        { provide: AdminBusinessesDbService, useValue: adminBusinessesDbService },
        { provide: AdminOverviewDbService, useValue: adminOverviewDbService },
        { provide: BillingReconciliationService, useValue: billingReconciliationService },
        { provide: ErasureNoticeService, useValue: erasureNoticeService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    target = module.get(AdminBusinessesService);
  });

  describe('list', () => {
    it('rejects a tenant-user token', async () => {
      await expect(target.list(tenantUser, {})).rejects.toThrow(ForbiddenException);
      expect(adminBusinessesDbService.findPage).not.toHaveBeenCalled();
    });

    // Regression: an unfiltered list returned every business on the platform in one response.
    it('returns the first page of 10 by default, with the paging meta', async () => {
      adminBusinessesDbService.findPage.mockResolvedValue({ businesses: [summary], total: 25 });

      const result = await target.list(admin, {});

      expect(adminBusinessesDbService.findPage).toHaveBeenCalledWith({
        search: undefined,
        page: 1,
        pageSize: 10,
      });
      expect(result.businesses).toHaveLength(1);
      expect(result.businesses[0]?.name).toBe('The Coastal Table');
      expect(result.meta).toEqual({ page: 1, pageSize: 10, total: 25, totalPages: 3 });
    });

    it('forwards the search term, page and page size to the db service', async () => {
      adminBusinessesDbService.findPage.mockResolvedValue({ businesses: [summary], total: 1 });

      await target.list(admin, { search: 'coastal', page: 2, pageSize: 5 });

      expect(adminBusinessesDbService.findPage).toHaveBeenCalledWith({
        search: 'coastal',
        page: 2,
        pageSize: 5,
      });
    });

    it('reports one page, not zero, when nothing matches', async () => {
      adminBusinessesDbService.findPage.mockResolvedValue({ businesses: [], total: 0 });

      const result = await target.list(admin, { search: 'nothing' });

      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('setStatus', () => {
    it('maps BusinessStatus.SUSPENDED to the real TenantStatus.SUSPENDED and logs the activity', async () => {
      adminBusinessesDbService.setStatus.mockResolvedValue({
        outcome: 'updated',
        changed: true,
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

    // Always lands on TenantStatus.ACTIVE, never pending_activation; both display as BusinessStatus.ACTIVE.
    it('maps BusinessStatus.ACTIVE to the real TenantStatus.ACTIVE and logs the activity', async () => {
      adminBusinessesDbService.setStatus.mockResolvedValue({
        outcome: 'updated',
        changed: true,
        summary,
      });

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

    it('answers like the first call but logs nothing when the business already had that status', async () => {
      adminBusinessesDbService.setStatus.mockResolvedValue({
        outcome: 'updated',
        changed: false,
        summary: { ...summary, status: BusinessStatus.SUSPENDED },
      });

      const result = await target.setStatus(admin, {
        tenantId: 'tenant-1',
        status: BusinessStatus.SUSPENDED,
      });

      expect(result.status).toBe(BusinessStatus.SUSPENDED);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
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
        outcome: 'requested',
        summary: {
          ...summary,
          status: BusinessStatus.SUSPENDED,
          erasureRequestedAt: '2026-03-05T09:12:00.000Z',
        },
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

    it('schedules the subscription to cancel at period end when erasure is requested', async () => {
      adminBusinessesDbService.requestErasure.mockResolvedValue({
        outcome: 'requested',
        summary: {
          ...summary,
          status: BusinessStatus.SUSPENDED,
          erasureRequestedAt: '2026-03-05T09:12:00.000Z',
        },
      });

      await target.requestErasure(admin, 'tenant-1');

      expect(billingReconciliationService.scheduleCancellationForErasure).toHaveBeenCalledWith(
        'tenant-1'
      );
    });

    it('tells the business owners, attributing the request to a platform administrator', async () => {
      adminBusinessesDbService.requestErasure.mockResolvedValue({ outcome: 'requested', summary });

      await target.requestErasure(admin, 'tenant-1');

      expect(erasureNoticeService.notifyScheduled).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        businessName: 'The Coastal Table',
        requestedBy: 'admin',
      });
    });

    it('still succeeds when Stripe cannot be reached — the purge deletes the customer anyway', async () => {
      adminBusinessesDbService.requestErasure.mockResolvedValue({
        outcome: 'requested',
        summary: {
          ...summary,
          status: BusinessStatus.SUSPENDED,
          erasureRequestedAt: '2026-03-05T09:12:00.000Z',
        },
      });
      billingReconciliationService.scheduleCancellationForErasure.mockRejectedValue(
        new Error('stripe unreachable')
      );

      const result = await target.requestErasure(admin, 'tenant-1');

      expect(result.business.erasureRequestedAt).toBe('2026-03-05T09:12:00.000Z');
      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalled();
    });

    it('defaults the grace period to 21 days when unset', async () => {
      adminBusinessesDbService.requestErasure.mockResolvedValue({ outcome: 'requested', summary });

      const result = await target.requestErasure(admin, 'tenant-1');

      expect(result.gracePeriodDays).toBe(21);
    });

    it('does nothing more for a repeat request: no subscription change, activity entry or owner email', async () => {
      adminBusinessesDbService.requestErasure.mockResolvedValue({
        outcome: 'already_requested',
        summary: {
          ...summary,
          status: BusinessStatus.SUSPENDED,
          erasureRequestedAt: '2026-03-05T09:12:00.000Z',
        },
      });
      configService.get.mockReturnValue(30);

      const result = await target.requestErasure(admin, 'tenant-1');

      expect(result.business.erasureRequestedAt).toBe('2026-03-05T09:12:00.000Z');
      expect(result.gracePeriodDays).toBe(30);
      expect(billingReconciliationService.scheduleCancellationForErasure).not.toHaveBeenCalled();
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
      expect(erasureNoticeService.notifyScheduled).not.toHaveBeenCalled();
    });

    it('throws 404 when no such tenant exists (or it is already erased), without logging any activity', async () => {
      adminBusinessesDbService.requestErasure.mockResolvedValue({ outcome: 'not_found' });

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
      adminBusinessesDbService.cancelErasure.mockResolvedValue({ outcome: 'cancelled', summary });

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

    it('tells the business owners it was cancelled', async () => {
      adminBusinessesDbService.cancelErasure.mockResolvedValue({ outcome: 'cancelled', summary });

      await target.cancelErasure(admin, 'tenant-1');

      expect(erasureNoticeService.notifyCancelled).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        businessName: 'The Coastal Table',
      });
    });

    it('resumes a subscription the erasure set to end', async () => {
      adminBusinessesDbService.cancelErasure.mockResolvedValue({ outcome: 'cancelled', summary });

      await target.cancelErasure(admin, 'tenant-1');

      expect(billingReconciliationService.resumeAfterErasureCancelled).toHaveBeenCalledWith(
        'tenant-1'
      );
    });

    it('still succeeds when the resume fails, since the erasure is already cancelled', async () => {
      adminBusinessesDbService.cancelErasure.mockResolvedValue({ outcome: 'cancelled', summary });
      billingReconciliationService.resumeAfterErasureCancelled.mockRejectedValue(
        new Error('stripe unreachable')
      );

      await expect(target.cancelErasure(admin, 'tenant-1')).resolves.toBeDefined();
      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalled();
    });

    it('throws 409, not 404, when the business exists but has no pending erasure', async () => {
      adminBusinessesDbService.cancelErasure.mockResolvedValue({ outcome: 'not_pending' });

      await expect(target.cancelErasure(admin, 'tenant-1')).rejects.toThrow(ConflictException);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
      expect(erasureNoticeService.notifyCancelled).not.toHaveBeenCalled();
      expect(billingReconciliationService.resumeAfterErasureCancelled).not.toHaveBeenCalled();
    });

    it('does not touch billing when there was no pending erasure to cancel', async () => {
      adminBusinessesDbService.cancelErasure.mockResolvedValue({ outcome: 'not_found' });

      await expect(target.cancelErasure(admin, 'tenant-1')).rejects.toThrow();

      expect(billingReconciliationService.resumeAfterErasureCancelled).not.toHaveBeenCalled();
    });

    it('throws 404 when no such tenant exists, without logging any activity', async () => {
      adminBusinessesDbService.cancelErasure.mockResolvedValue({ outcome: 'not_found' });

      await expect(target.cancelErasure(admin, 'missing')).rejects.toThrow(NotFoundException);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });
  });
});
