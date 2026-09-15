import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import type { PlatformAdminAuthUser } from '@auth/types/auth-user.type';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { AdminUsersDbService } from '@db/repositories/admin-users/admin-users.db-service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  let target: AdminUsersService;
  let adminUsersDbService: { findAll: jest.Mock; toggleActive: jest.Mock };
  let adminOverviewDbService: { recordActivityBestEffort: jest.Mock };

  const admin: PlatformAdminAuthUser = {
    type: JwtTokenType.PLATFORM_ADMIN,
    id: 'admin-1',
    email: 'admin@innopeak.com',
  };

  const row = {
    id: 'user-1',
    businessId: 'tenant-1',
    businessName: 'The Coffee House',
    name: 'Jane Doe',
    email: 'jane@thecoffeehouse.com',
    role: UserRole.OWNER,
    status: UserStatus.ACTIVE,
    lastLoginAt: '2026-03-01T09:12:00.000Z',
  };

  beforeEach(async () => {
    adminUsersDbService = { findAll: jest.fn(), toggleActive: jest.fn() };
    adminOverviewDbService = { recordActivityBestEffort: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: AdminUsersDbService, useValue: adminUsersDbService },
        { provide: AdminOverviewDbService, useValue: adminOverviewDbService },
      ],
    }).compile();

    target = module.get(AdminUsersService);
  });

  describe('list', () => {
    it('maps status to a boolean isActive', async () => {
      adminUsersDbService.findAll.mockResolvedValue([row, { ...row, status: UserStatus.DISABLED }]);

      const result = await target.list(admin);

      expect(result[0]?.isActive).toBe(true);
      expect(result[1]?.isActive).toBe(false);
    });

    it('maps a non-active, non-disabled status (e.g. pending_verification) to inactive', async () => {
      adminUsersDbService.findAll.mockResolvedValue([
        { ...row, status: UserStatus.PENDING_VERIFICATION },
      ]);

      const result = await target.list(admin);

      expect(result[0]?.isActive).toBe(false);
    });
  });

  describe('toggleActive', () => {
    it('returns the updated row on success', async () => {
      adminUsersDbService.toggleActive.mockResolvedValue({ ...row, status: UserStatus.DISABLED });

      const result = await target.toggleActive(admin, 'user-1');

      expect(adminUsersDbService.toggleActive).toHaveBeenCalledWith('user-1');
      expect(result.isActive).toBe(false);
    });

    it('throws 404 when no such user exists, without logging any activity', async () => {
      adminUsersDbService.toggleActive.mockResolvedValue(null);

      await expect(target.toggleActive(admin, 'missing')).rejects.toThrow(NotFoundException);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });

    /**
     * Disabling a customer's account is the most consequential per-person action here, and it used
     * to leave no trace in the feed at all — there was no actor to attribute it to and no event
     * type to record.
     */
    it('records a user_deactivated entry naming both the person and their business', async () => {
      adminUsersDbService.toggleActive.mockResolvedValue({ ...row, status: UserStatus.DISABLED });

      await target.toggleActive(admin, 'user-1');

      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith({
        type: PlatformActivityType.USER_DEACTIVATED,
        actorPlatformAdminId: 'admin-1',
        actorEmail: 'admin@innopeak.com',
        tenantId: 'tenant-1',
        businessName: 'The Coffee House',
        targetEmail: 'jane@thecoffeehouse.com',
      });
    });

    it('records user_activated when the toggle re-enables the account', async () => {
      adminUsersDbService.toggleActive.mockResolvedValue({ ...row, status: UserStatus.ACTIVE });

      await target.toggleActive(admin, 'user-1');

      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith(
        expect.objectContaining({ type: PlatformActivityType.USER_ACTIVATED })
      );
    });

    /** The check every sibling admin service already had; this was the one relying on the guard alone. */
    it('refuses a tenant user even if the controller guard were bypassed', async () => {
      const tenantActor = {
        type: JwtTokenType.TENANT_USER,
        id: 'user-9',
        tenantId: 'tenant-9',
        email: 'owner@x.com',
        role: UserRole.OWNER,
        locale: null,
      } as const;

      await expect(target.toggleActive(tenantActor, 'user-1')).rejects.toThrow(ForbiddenException);
      await expect(target.list(tenantActor)).rejects.toThrow(ForbiddenException);
      expect(adminUsersDbService.toggleActive).not.toHaveBeenCalled();
    });
  });
});
