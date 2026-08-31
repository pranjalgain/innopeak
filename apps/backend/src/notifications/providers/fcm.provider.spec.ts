import type { EnvConfig } from '@config/env.config';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import { FcmPushProvider } from './fcm.provider';

import type { PushNotificationPayload } from '../interfaces/notification.interface';

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  cert: jest.fn(),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(),
}));

describe('FcmPushProvider', () => {
  let target: FcmPushProvider;
  let configService: { get: jest.Mock };
  let sendEachForMulticast: jest.Mock;
  let send: jest.Mock;
  const fakeApp = { name: 'fake-app' };

  const completeCredentials: Record<string, string> = {
    FCM_PROJECT_ID: 'project-id',
    FCM_PRIVATE_KEY: 'private-key\\nline2',
    FCM_CLIENT_EMAIL: 'sa@project-id.iam.gserviceaccount.com',
  };

  beforeEach(async () => {
    configService = { get: jest.fn() };
    sendEachForMulticast = jest.fn();
    send = jest.fn();

    (initializeApp as jest.Mock).mockReturnValue(fakeApp);
    (cert as jest.Mock).mockReturnValue({ cert: true });
    (getMessaging as jest.Mock).mockReturnValue({ sendEachForMulticast, send });

    const module: TestingModule = await Test.createTestingModule({
      providers: [FcmPushProvider, { provide: ConfigService<EnvConfig>, useValue: configService }],
    }).compile();

    target = module.get(FcmPushProvider);
  });

  afterEach(() => jest.clearAllMocks());

  function configureWith(overrides: Partial<Record<string, string>>): void {
    configService.get.mockImplementation((key: string) => overrides[key]);
  }

  describe('onModuleInit', () => {
    it('initializes the Firebase app when all credentials are configured', async () => {
      configureWith(completeCredentials);

      target.onModuleInit();

      expect(cert).toHaveBeenCalledWith({
        projectId: 'project-id',
        privateKey: 'private-key\nline2',
        clientEmail: 'sa@project-id.iam.gserviceaccount.com',
      });
      expect(initializeApp).toHaveBeenCalled();

      // Indirectly confirm `app` was set: sendToDevices should proceed past the
      // "not initialized" guard and call into the messaging SDK.
      sendEachForMulticast.mockResolvedValue({ successCount: 1, failureCount: 0, responses: [] });
      const result = await target.sendToDevices({
        title: 't',
        body: 'b',
        fids: ['fid-1'],
      });

      expect(getMessaging).toHaveBeenCalledWith(fakeApp);
      expect(result).toEqual({ successCount: 1, failureCount: 0 });
    });

    it('skips initialization when credentials are incomplete', async () => {
      configureWith({ FCM_PROJECT_ID: 'project-id' });

      target.onModuleInit();

      expect(initializeApp).not.toHaveBeenCalled();

      const result = await target.sendToDevices({ title: 't', body: 'b', fids: ['fid-1'] });

      expect(result).toEqual({ successCount: 0, failureCount: 1 });
    });

    it('logs and swallows errors thrown while initializing the app', async () => {
      configureWith(completeCredentials);
      (initializeApp as jest.Mock).mockImplementation(() => {
        throw new Error('bad credentials');
      });

      expect(() => {
        target.onModuleInit();
      }).not.toThrow();

      const result = await target.sendToDevices({ title: 't', body: 'b', fids: ['fid-1'] });
      expect(result).toEqual({ successCount: 0, failureCount: 1 });
    });
  });

  describe('sendToDevices', () => {
    it('returns a failure result without calling messaging when not initialized', async () => {
      const result = await target.sendToDevices({
        title: 't',
        body: 'b',
        fids: ['fid-1', 'fid-2'],
      });

      expect(getMessaging).not.toHaveBeenCalled();
      expect(result).toEqual({ successCount: 0, failureCount: 2 });
    });

    it('returns zero counts immediately when there are no device FIDs', async () => {
      configureWith(completeCredentials);
      target.onModuleInit();

      const result = await target.sendToDevices({ title: 't', body: 'b', fids: [] });

      expect(result).toEqual({ successCount: 0, failureCount: 0 });
      expect(sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('sends to all devices and maps data payload values to strings', async () => {
      configureWith(completeCredentials);
      target.onModuleInit();
      sendEachForMulticast.mockResolvedValue({ successCount: 2, failureCount: 0, responses: [] });

      const payload: PushNotificationPayload = {
        title: 't',
        body: 'b',
        fids: ['fid-1', 'fid-2'],
        data: { orderId: '123', meta: { nested: true } },
      };

      const result = await target.sendToDevices(payload);

      expect(sendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          notification: { title: 't', body: 'b' },
          fids: ['fid-1', 'fid-2'],
          data: { orderId: '123', meta: JSON.stringify({ nested: true }) },
        })
      );
      expect(result).toEqual({ successCount: 2, failureCount: 0 });
    });

    it('reports partial failures without throwing', async () => {
      configureWith(completeCredentials);
      target.onModuleInit();
      sendEachForMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        responses: [{ success: true }, { success: false }],
      });

      const result = await target.sendToDevices({
        title: 't',
        body: 'b',
        fids: ['fid-1', 'fid-2'],
      });

      expect(result).toEqual({ successCount: 1, failureCount: 1 });
    });

    it('catches errors from the messaging SDK and returns a full-failure result', async () => {
      configureWith(completeCredentials);
      target.onModuleInit();
      sendEachForMulticast.mockRejectedValue(new Error('network error'));

      const result = await target.sendToDevices({
        title: 't',
        body: 'b',
        fids: ['fid-1', 'fid-2'],
      });

      expect(result).toEqual({ successCount: 0, failureCount: 2 });
    });
  });

  describe('sendToTopic', () => {
    it('does nothing when not initialized', async () => {
      await expect(
        target.sendToTopic('topic-1', { title: 't', body: 'b' })
      ).resolves.toBeUndefined();
      expect(getMessaging).not.toHaveBeenCalled();
    });

    it('sends the message to the topic', async () => {
      configureWith(completeCredentials);
      target.onModuleInit();
      send.mockResolvedValue('message-id-123');

      await target.sendToTopic('topic-1', { title: 't', body: 'b', data: { a: 'b' } });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ notification: { title: 't', body: 'b' }, topic: 'topic-1' })
      );
    });

    it('rethrows errors from the messaging SDK', async () => {
      configureWith(completeCredentials);
      target.onModuleInit();
      send.mockRejectedValue(new Error('topic send failed'));

      await expect(target.sendToTopic('topic-1', { title: 't', body: 'b' })).rejects.toThrow(
        'topic send failed'
      );
    });
  });
});
