import { UserRole } from '@auth/enums/user-role.enum';
import { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';
import { NotificationsDbService } from '@db/repositories/notifications/notifications.db-service';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { NotificationsService } from './notifications.service';

import { JwtTokenType } from '../../auth/enums/jwt-token-type.enum';
import type { TenantAuthUser } from '../../auth/types/auth.type';

describe('NotificationsService', () => {
  let target: NotificationsService;
  let notificationsDbService: { listPage: jest.Mock; markRead: jest.Mock; markAllRead: jest.Mock };

  const tenantUser: TenantAuthUser = {
    type: JwtTokenType.TENANT_USER,
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'owner@example.com',
    role: UserRole.OWNER,
    locale: null,
  };

  beforeEach(async () => {
    notificationsDbService = { listPage: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsDbService, useValue: notificationsDbService },
      ],
    }).compile();

    target = module.get(NotificationsService);
  });

  it('scopes the query to the caller’s own tenant and user id', async () => {
    notificationsDbService.listPage.mockResolvedValue({
      items: [],
      hasMore: false,
      unreadTotal: 0,
    });

    await target.list(tenantUser, {});

    expect(notificationsDbService.listPage).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-1',
      offset: 0,
      limit: 20,
    });
  });

  it('defaults offset to 0 and limit to 20 when the query omits them', async () => {
    notificationsDbService.listPage.mockResolvedValue({
      items: [],
      hasMore: false,
      unreadTotal: 0,
    });

    await target.list(tenantUser, {});

    expect(notificationsDbService.listPage).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, limit: 20 })
    );
  });

  it('caps a requested limit at the maximum rather than passing it through', async () => {
    notificationsDbService.listPage.mockResolvedValue({
      items: [],
      hasMore: false,
      unreadTotal: 0,
    });

    await target.list(tenantUser, { limit: 500 });

    expect(notificationsDbService.listPage).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 })
    );
  });

  it('maps the db service page into the flat { items, hasMore, unreadTotal } response shape', async () => {
    notificationsDbService.listPage.mockResolvedValue({
      items: [
        {
          id: 'n1',
          type: InAppNotificationType.REVIEW_ESCALATED,
          title: 'Review escalated',
          description: 'A 1-star review needs your attention.',
          reviewId: 'review-1',
          isRead: false,
          createdAt: '2026-09-19T09:15:00.000Z',
        },
      ],
      hasMore: true,
      unreadTotal: 4,
    });

    const result = await target.list(tenantUser, { offset: 3, limit: 3 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: 'n1', isRead: false });
    expect(result.hasMore).toBe(true);
    expect(result.unreadTotal).toBe(4);
  });

  describe('markRead', () => {
    it('scopes the write to the caller’s own tenant and user id', async () => {
      notificationsDbService.markRead.mockResolvedValue({ unreadTotal: 3 });

      await target.markRead(tenantUser, 'n1');

      expect(notificationsDbService.markRead).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'user-1',
        notificationId: 'n1',
      });
    });

    /** The update matches nothing, so it is a 404; a "forbidden" would confirm the id exists in someone else's feed. */
    it('raises 404 for a notification that is not the caller’s', async () => {
      notificationsDbService.markRead.mockResolvedValue(null);

      await expect(target.markRead(tenantUser, 'someone-elses')).rejects.toThrow(NotFoundException);
    });

    it('returns the unread total the write left behind, for the badge', async () => {
      notificationsDbService.markRead.mockResolvedValue({ unreadTotal: 3 });

      await expect(target.markRead(tenantUser, 'n1')).resolves.toEqual({ unreadTotal: 3 });
    });
  });

  describe('markAllRead', () => {
    it('scopes the write to the caller’s own feed and reports the remaining unread count', async () => {
      notificationsDbService.markAllRead.mockResolvedValue({ unreadTotal: 0 });

      const result = await target.markAllRead(tenantUser);

      expect(notificationsDbService.markAllRead).toHaveBeenCalledWith('tenant-1', 'user-1');
      expect(result).toEqual({ unreadTotal: 0 });
    });
  });
});
