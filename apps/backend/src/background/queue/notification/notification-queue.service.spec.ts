import type {
  INotificationJob,
  INotificationTopicJob,
  ISendNotificationJob,
} from '@bg/interfaces/job.interface';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { NotificationsService } from '@notifications/notifications.service';

import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService', () => {
  let target: NotificationQueueService;
  let notificationsService: { send: jest.Mock };

  beforeEach(async () => {
    notificationsService = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationQueueService,
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    target = module.get(NotificationQueueService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('sendNotificationToDevice', () => {
    const data: INotificationJob = {
      deviceFids: ['fid-1', 'fid-2'],
      subject: 'Subject',
      message: 'Message',
      url: 'https://example.com',
      data: { extra: 'value' },
    };

    it('sends a push notification using the first device FID', async () => {
      notificationsService.send.mockResolvedValue({ id: 'notif-1' });

      await target.sendNotificationToDevice(data);

      expect(notificationsService.send).toHaveBeenCalledTimes(1);
      expect(notificationsService.send).toHaveBeenCalledWith({
        userId: 'fid-1',
        title: data.subject,
        body: data.message,
        type: 'push',
        channel: 'push',
        data: { url: data.url, extra: 'value' },
      });
    });

    it('defaults userId to empty string when deviceFids is empty', async () => {
      notificationsService.send.mockResolvedValue({ id: 'notif-2' });
      const emptyFidsData: INotificationJob = { ...data, deviceFids: [] };

      await target.sendNotificationToDevice(emptyFidsData);

      expect(notificationsService.send).toHaveBeenCalledWith(
        expect.objectContaining({ userId: '' })
      );
    });

    it('propagates the error when the notifications service rejects', async () => {
      const error = new Error('Push provider unavailable');
      notificationsService.send.mockRejectedValue(error);

      await expect(target.sendNotificationToDevice(data)).rejects.toThrow(error);
    });
  });

  describe('sendNotificationToTopic', () => {
    const topicData: INotificationTopicJob = {
      topic: 'announcements',
      subject: 'Subject',
      message: 'Message',
      url: 'https://example.com',
      data: {},
    };

    it('does not call the notifications service (topic sends are log-only)', () => {
      expect(() => {
        target.sendNotificationToTopic(topicData);
      }).not.toThrow();
      expect(notificationsService.send).not.toHaveBeenCalled();
    });

    it('returns undefined synchronously', () => {
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- asserting the void return is genuinely `undefined` at runtime is the point of this test
      const result = target.sendNotificationToTopic(topicData);

      expect(result).toBeUndefined();
    });
  });

  describe('sendNotification', () => {
    const data: ISendNotificationJob = {
      user_ids: ['user-1', 'user-2'],
      subject: 'Subject',
      message: 'Message',
      url: 'https://example.com',
      notification_type: 'system',
      data: { extra: 'value' },
    };

    it('sends an in-app notification to every target user', async () => {
      notificationsService.send.mockResolvedValue({ id: 'notif-1' });

      await target.sendNotification(data);

      expect(notificationsService.send).toHaveBeenCalledTimes(2);
      expect(notificationsService.send).toHaveBeenNthCalledWith(1, {
        userId: 'user-1',
        title: data.subject,
        body: data.message,
        type: data.notification_type,
        channel: 'in-app',
        data: { url: data.url, extra: 'value' },
      });
      expect(notificationsService.send).toHaveBeenNthCalledWith(2, {
        userId: 'user-2',
        title: data.subject,
        body: data.message,
        type: data.notification_type,
        channel: 'in-app',
        data: { url: data.url, extra: 'value' },
      });
    });

    it('propagates the error when any notification send rejects', async () => {
      const error = new Error('Database unavailable');
      notificationsService.send.mockResolvedValueOnce({ id: 'ok' }).mockRejectedValue(error);

      await expect(target.sendNotification(data)).rejects.toThrow(error);
    });
  });
});
