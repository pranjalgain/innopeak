import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type { NotificationRecord } from './interfaces/notification.interface';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

import type { AuthUser } from '../auth/interfaces/auth-user.interface';

describe('NotificationsController', () => {
  let target: NotificationsController;
  let notificationsService: {
    send: jest.Mock;
    getNotifications: jest.Mock;
    getUnreadCount: jest.Mock;
    markAsRead: jest.Mock;
    markAllAsRead: jest.Mock;
    registerDevice: jest.Mock;
  };

  const user: AuthUser = {
    id: 'user-1',
    email: 'user@example.com',
    roles: ['user'],
    permissions: [],
  };

  const record: NotificationRecord = {
    id: 'notif-1',
    userId: 'user-1',
    title: 'Title',
    body: 'Body',
    type: 'message',
    data: {},
    channel: 'push',
    isRead: false,
    sentAt: new Date(),
    readAt: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    notificationsService = {
      send: jest.fn(),
      getNotifications: jest.fn(),
      getUnreadCount: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      registerDevice: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: notificationsService }],
    }).compile();

    target = module.get(NotificationsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('listNotifications', () => {
    it('returns paginated notifications with meta', async () => {
      notificationsService.getNotifications.mockResolvedValue({ data: [record], total: 1 });

      const result = await target.listNotifications(user, 1, 20);

      expect(notificationsService.getNotifications).toHaveBeenCalledWith('user-1', 1, 20);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe('notif-1');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    it('computes totalPages correctly when total spans multiple pages', async () => {
      notificationsService.getNotifications.mockResolvedValue({ data: [], total: 45 });

      const result = await target.listNotifications(user, 2, 20);

      expect(result.meta.totalPages).toBe(3);
    });
  });

  describe('getUnreadCount', () => {
    it('returns the unread count for the current user', async () => {
      notificationsService.getUnreadCount.mockResolvedValue(3);

      const result = await target.getUnreadCount(user);

      expect(notificationsService.getUnreadCount).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ unreadCount: 3 });
    });
  });

  describe('sendNotification', () => {
    it('sends a notification and returns the mapped response', async () => {
      notificationsService.send.mockResolvedValue(record);

      const result = await target.sendNotification('user-1', {
        title: 'Title',
        body: 'Body',
        type: 'message',
        channel: 'push',
      });

      expect(notificationsService.send).toHaveBeenCalledWith({
        userId: 'user-1',
        title: 'Title',
        body: 'Body',
        type: 'message',
        channel: 'push',
      });
      expect(result.id).toBe('notif-1');
    });

    it('includes the optional data payload when provided', async () => {
      notificationsService.send.mockResolvedValue(record);

      await target.sendNotification('user-1', {
        title: 'Title',
        body: 'Body',
        type: 'message',
        channel: 'push',
        data: { orderId: '123' },
      });

      expect(notificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({ data: { orderId: '123' } })
      );
    });
  });

  describe('markAsRead', () => {
    it('returns the mapped notification when found', async () => {
      notificationsService.markAsRead.mockResolvedValue(record);

      const result = await target.markAsRead('notif-1', user);

      expect(notificationsService.markAsRead).toHaveBeenCalledWith('notif-1', 'user-1');
      expect(result.id).toBe('notif-1');
    });

    it('throws NotFoundException when the notification does not exist', async () => {
      notificationsService.markAsRead.mockResolvedValue(null);

      await expect(target.markAsRead('missing', user)).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllAsRead', () => {
    it('returns the marked count', async () => {
      notificationsService.markAllAsRead.mockResolvedValue(5);

      const result = await target.markAllAsRead(user);

      expect(notificationsService.markAllAsRead).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ markedCount: 5 });
    });
  });

  describe('registerDevice', () => {
    it('registers the device FID and returns a confirmation message', async () => {
      notificationsService.registerDevice.mockResolvedValue(undefined);

      const result = await target.registerDevice(user, { fid: 'fid-abc', platform: 'ios' });

      expect(notificationsService.registerDevice).toHaveBeenCalledWith('user-1', 'fid-abc', 'ios');
      expect(result).toEqual({ message: 'Device FID registered successfully' });
    });
  });
});
