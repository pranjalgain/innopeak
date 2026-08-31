import { NotificationsRepository } from '@db/repositories/notifications/notifications.repository';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type {
  NotificationRecord,
  SendNotificationOptions,
} from './interfaces/notification.interface';
import { NotificationsService } from './notifications.service';
import { PushProvider } from './providers/push.provider';

describe('NotificationsService', () => {
  let target: NotificationsService;
  let notificationsRepository: {
    create: jest.Mock;
    findByUserId: jest.Mock;
    markAsRead: jest.Mock;
    markAllAsRead: jest.Mock;
    getUnreadCount: jest.Mock;
    registerDeviceFid: jest.Mock;
    findDeviceFids: jest.Mock;
  };
  let pushProvider: { sendToDevices: jest.Mock; sendToTopic: jest.Mock };

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
    notificationsRepository = {
      create: jest.fn(),
      findByUserId: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      getUnreadCount: jest.fn(),
      registerDeviceFid: jest.fn(),
      findDeviceFids: jest.fn(),
    };
    pushProvider = {
      sendToDevices: jest.fn(),
      sendToTopic: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: notificationsRepository },
        { provide: PushProvider, useValue: pushProvider },
      ],
    }).compile();

    target = module.get(NotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('send', () => {
    it('creates the notification record without pushing for non-push channels', async () => {
      const options: SendNotificationOptions = {
        userId: 'user-1',
        title: 'Title',
        body: 'Body',
        type: 'message',
        channel: 'email',
      };
      notificationsRepository.create.mockResolvedValue({ ...record, channel: 'email' });

      const result = await target.send(options);

      expect(notificationsRepository.create).toHaveBeenCalledWith(options);
      expect(pushProvider.sendToDevices).not.toHaveBeenCalled();
      expect(result.channel).toBe('email');
    });

    it('sends a push notification when channel is push and device FIDs exist', async () => {
      const options: SendNotificationOptions = {
        userId: 'user-1',
        title: 'Title',
        body: 'Body',
        type: 'message',
        channel: 'push',
        data: { orderId: '123' },
      };
      notificationsRepository.create.mockResolvedValue(record);
      notificationsRepository.findDeviceFids.mockResolvedValue([
        {
          id: 'dt-1',
          userId: 'user-1',
          fid: 'fid-a',
          platform: 'ios',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      pushProvider.sendToDevices.mockResolvedValue({ successCount: 1, failureCount: 0 });

      const result = await target.send(options);

      expect(pushProvider.sendToDevices).toHaveBeenCalledWith({
        title: 'Title',
        body: 'Body',
        data: { orderId: '123' },
        fids: ['fid-a'],
      });
      expect(result).toEqual(record);
    });

    it('skips push sending when there are no active device FIDs', async () => {
      const options: SendNotificationOptions = {
        userId: 'user-1',
        title: 'Title',
        body: 'Body',
        type: 'message',
        channel: 'push',
      };
      notificationsRepository.create.mockResolvedValue(record);
      notificationsRepository.findDeviceFids.mockResolvedValue([]);

      await target.send(options);

      expect(pushProvider.sendToDevices).not.toHaveBeenCalled();
    });

    it('swallows push provider errors and still returns the created record', async () => {
      const options: SendNotificationOptions = {
        userId: 'user-1',
        title: 'Title',
        body: 'Body',
        type: 'message',
        channel: 'push',
      };
      notificationsRepository.create.mockResolvedValue(record);
      notificationsRepository.findDeviceFids.mockRejectedValue(new Error('db down'));

      await expect(target.send(options)).resolves.toEqual(record);
    });
  });

  describe('getNotifications', () => {
    it('delegates to the repository', async () => {
      const page = { data: [record], total: 1 };
      notificationsRepository.findByUserId.mockResolvedValue(page);

      const result = await target.getNotifications('user-1', 1, 20);

      expect(notificationsRepository.findByUserId).toHaveBeenCalledWith('user-1', 1, 20);
      expect(result).toEqual(page);
    });
  });

  describe('markAsRead', () => {
    it('returns the updated record when found', async () => {
      notificationsRepository.markAsRead.mockResolvedValue(record);

      const result = await target.markAsRead('notif-1', 'user-1');

      expect(result).toEqual(record);
    });

    it('returns null when the notification is not found', async () => {
      notificationsRepository.markAsRead.mockResolvedValue(null);

      const result = await target.markAsRead('missing', 'user-1');

      expect(result).toBeNull();
    });
  });

  describe('markAllAsRead', () => {
    it('returns the number of notifications marked as read', async () => {
      notificationsRepository.markAllAsRead.mockResolvedValue(4);

      const result = await target.markAllAsRead('user-1');

      expect(result).toBe(4);
    });
  });

  describe('getUnreadCount', () => {
    it('returns the unread count', async () => {
      notificationsRepository.getUnreadCount.mockResolvedValue(7);

      const result = await target.getUnreadCount('user-1');

      expect(result).toBe(7);
    });
  });

  describe('registerDevice', () => {
    it('registers a device FID via the repository', async () => {
      notificationsRepository.registerDeviceFid.mockResolvedValue(undefined);

      await target.registerDevice('user-1', 'fid-abc', 'android');

      expect(notificationsRepository.registerDeviceFid).toHaveBeenCalledWith(
        'user-1',
        'fid-abc',
        'android'
      );
    });
  });
});
