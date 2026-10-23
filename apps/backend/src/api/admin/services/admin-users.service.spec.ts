import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import { TokenService } from '@auth/services/token.service';
import type { PlatformAdminAuthUser } from '@auth/types/auth.type';
import { MESSAGES } from '@common/constants/messages.constants';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { AdminUsersDbService } from '@db/repositories/admin-users/admin-users.db-service';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  let target: AdminUsersService;
  let adminUsersDbService: { findPage: jest.Mock; toggleActive: jest.Mock };
  let tokenService: { revokeAll: jest.Mock };
  let adminOverviewDbService: { recordActivityBestEffort: jest.Mock };

  const admin: PlatformAdminAuthUser = {
    type: JwtTokenType.PLATFORM_ADMIN,
    id: 'admin-1',
    email: 'admin@innopeak.com',
    locale: null,
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
    adminUsersDbService = { findPage: jest.fn(), toggleActive: jest.fn() };
    adminOverviewDbService = { recordActivityBestEffort: jest.fn() };
    tokenService = { revokeAll: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: AdminUsersDbService, useValue: adminUsersDbService },
        { provide: AdminOverviewDbService, useValue: adminOverviewDbService },
        { provide: TokenService, useValue: tokenService },
      ],
    }).compile();

    target = module.get(AdminUsersService);
  });

  describe('list', () => {
    it('maps status to a boolean isActive', async () => {
      adminUsersDbService.findPage.mockResolvedValue({
        rows: [row, { ...row, status: UserStatus.DISABLED }],
        total: 2,
      });

      const result = await target.list(admin, {});

      expect(adminUsersDbService.findPage).toHaveBeenCalledWith({
        search: undefined,
        page: 1,
        pageSize: 10,
      });
      expect(result.users[0]?.isActive).toBe(true);
      expect(result.users[1]?.isActive).toBe(false);
      expect(result.meta).toEqual({ page: 1, pageSize: 10, total: 2, totalPages: 1 });
    });

    it('maps a non-active, non-disabled status (e.g. pending_verification) to inactive', async () => {
      adminUsersDbService.findPage.mockResolvedValue({
        rows: [{ ...row, status: UserStatus.PENDING_VERIFICATION }],
        total: 1,
      });

      const result = await target.list(admin, {});

      expect(result.users[0]?.isActive).toBe(false);
    });

    it('forwards the search term, page and page size to the db service', async () => {
      adminUsersDbService.findPage.mockResolvedValue({ rows: [row], total: 1 });

      await target.list(admin, { search: 'jane', page: 3, pageSize: 20 });

      expect(adminUsersDbService.findPage).toHaveBeenCalledWith({
        search: 'jane',
        page: 3,
        pageSize: 20,
      });
    });
  });

  describe('toggleActive', () => {
    it('returns the updated row on success', async () => {
      adminUsersDbService.toggleActive.mockResolvedValue({
        outcome: 'toggled',
        row: { ...row, status: UserStatus.DISABLED },
      });

      const result = await target.toggleActive(admin, 'user-1');

      expect(adminUsersDbService.toggleActive).toHaveBeenCalledWith('user-1', undefined);
      expect(result.isActive).toBe(false);
    });

    it('passes the state the admin asked for down, so the write can be idempotent', async () => {
      adminUsersDbService.toggleActive.mockResolvedValue({
        outcome: 'toggled',
        row: { ...row, status: UserStatus.DISABLED },
      });

      await target.toggleActive(admin, 'user-1', false);

      expect(adminUsersDbService.toggleActive).toHaveBeenCalledWith('user-1', false);
    });

    // A stale list or a double click: the user is already where the admin wanted them, so nothing happens.
    it('returns the user untouched, ending no sessions and logging nothing, when they were already in that state', async () => {
      adminUsersDbService.toggleActive.mockResolvedValue({
        outcome: 'unchanged',
        row: { ...row, status: UserStatus.DISABLED },
      });

      const result = await target.toggleActive(admin, 'user-1', false);

      expect(result.isActive).toBe(false);
      expect(tokenService.revokeAll).not.toHaveBeenCalled();
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });

    it('refuses a member who has not accepted their invite, without logging anything', async () => {
      adminUsersDbService.toggleActive.mockResolvedValue({ outcome: 'invited' });

      await expect(target.toggleActive(admin, 'user-1')).rejects.toThrow(
        MESSAGES.ADMIN.USER_INVITE_PENDING
      );
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });

    // A deactivated user must lose access now, not when their access token happens to lapse.
    it("ends the user's access tokens when they are deactivated, and not when they are activated", async () => {
      adminUsersDbService.toggleActive.mockResolvedValueOnce({
        outcome: 'toggled',
        row: { ...row, status: UserStatus.DISABLED },
      });
      await target.toggleActive(admin, 'user-1');
      expect(tokenService.revokeAll).toHaveBeenCalledWith('user-1');

      tokenService.revokeAll.mockClear();
      adminUsersDbService.toggleActive.mockResolvedValueOnce({
        outcome: 'toggled',
        row: { ...row, status: UserStatus.ACTIVE },
      });
      await target.toggleActive(admin, 'user-1');
      expect(tokenService.revokeAll).not.toHaveBeenCalled();
    });

    it('ends no sessions when nothing changed', async () => {
      adminUsersDbService.toggleActive.mockResolvedValue({ outcome: 'not_found' });

      await expect(target.toggleActive(admin, 'missing')).rejects.toThrow(NotFoundException);

      expect(tokenService.revokeAll).not.toHaveBeenCalled();
    });

    it('throws 404 when no such user exists, without logging any activity', async () => {
      adminUsersDbService.toggleActive.mockResolvedValue({ outcome: 'not_found' });

      await expect(target.toggleActive(admin, 'missing')).rejects.toThrow(NotFoundException);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });

    it('throws 409 when the user has a pending removal request, without logging any activity', async () => {
      adminUsersDbService.toggleActive.mockResolvedValue({ outcome: 'removal_pending' });

      await expect(target.toggleActive(admin, 'user-1')).rejects.toThrow(ConflictException);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });

    it('records a user_deactivated entry naming both the person and their business', async () => {
      adminUsersDbService.toggleActive.mockResolvedValue({
        outcome: 'toggled',
        row: { ...row, status: UserStatus.DISABLED },
      });

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
      adminUsersDbService.toggleActive.mockResolvedValue({
        outcome: 'toggled',
        row: { ...row, status: UserStatus.ACTIVE },
      });

      await target.toggleActive(admin, 'user-1');

      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith(
        expect.objectContaining({ type: PlatformActivityType.USER_ACTIVATED })
      );
    });

    /** Fails safe if the controller's `@Roles` guard is ever loosened. */
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
      await expect(target.list(tenantActor, {})).rejects.toThrow(ForbiddenException);
      expect(adminUsersDbService.toggleActive).not.toHaveBeenCalled();
    });
  });
});
