import { EnvConfig } from '@config/env.config';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, initializeApp } from 'firebase-admin/app';
import { FidMulticastMessage, getMessaging, Message } from 'firebase-admin/messaging';

import { PushProvider, PushSendResult } from './push.provider';

import { PushNotificationPayload } from '../interfaces/notification.interface';

@Injectable()
export class FcmPushProvider extends PushProvider implements OnModuleInit {
  private readonly logger = new Logger(FcmPushProvider.name);
  private app: App | undefined;

  constructor(private readonly configService: ConfigService<EnvConfig>) {
    super();
  }

  onModuleInit(): void {
    const projectId = this.configService.get<string>('FCM_PROJECT_ID') ?? '';
    const privateKey = (this.configService.get<string>('FCM_PRIVATE_KEY') ?? '').replace(
      /\\n/g,
      '\n'
    );
    const clientEmail = this.configService.get<string>('FCM_CLIENT_EMAIL') ?? '';

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('FCM credentials not configured. Push notifications will be unavailable.');
      return;
    }

    try {
      this.app = initializeApp({
        credential: cert({
          projectId,
          privateKey,
          clientEmail,
        }),
      });
      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Firebase Admin SDK: ${(error as Error).message}`);
    }
  }

  async sendToDevices(payload: PushNotificationPayload): Promise<PushSendResult> {
    if (!this.app) {
      this.logger.warn('FCM not initialized. Skipping push notification.');
      return { successCount: 0, failureCount: payload.fids.length };
    }

    if (payload.fids.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    try {
      const message: FidMulticastMessage = {
        notification: {
          title: payload.title,
          body: payload.body,
        },
        fids: payload.fids,
      };
      if (payload.data) {
        message.data = Object.fromEntries(
          Object.entries(payload.data).map(([key, value]) => [
            key,
            typeof value === 'string' ? value : JSON.stringify(value),
          ])
        );
      }

      const response = await getMessaging(this.app).sendEachForMulticast(message);

      if (response.failureCount > 0) {
        const failedFids = response.responses
          .map((resp: { success: boolean }, idx: number) => {
            return resp.success ? null : payload.fids[idx];
          })
          .filter((fid: string | null | undefined): fid is string => fid != null);

        this.logger.warn(
          `Failed to send to ${response.failureCount} device(s): ${failedFids.join(', ')}`
        );
      }

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      this.logger.error(`FCM sendToDevices failed: ${(error as Error).message}`);
      return { successCount: 0, failureCount: payload.fids.length };
    }
  }

  async sendToTopic(topic: string, payload: Omit<PushNotificationPayload, 'fids'>): Promise<void> {
    if (!this.app) {
      this.logger.warn('FCM not initialized. Skipping topic notification.');
      return;
    }

    try {
      const message: Message = {
        notification: {
          title: payload.title,
          body: payload.body,
        },
        topic,
      };
      if (payload.data) {
        message.data = Object.fromEntries(
          Object.entries(payload.data).map(([key, value]) => [
            key,
            typeof value === 'string' ? value : JSON.stringify(value),
          ])
        );
      }

      const messageId = await getMessaging(this.app).send(message);
      this.logger.debug(`Topic notification sent to "${topic}": ${messageId}`);
    } catch (error) {
      this.logger.error(`FCM sendToTopic failed for topic "${topic}": ${(error as Error).message}`);
      throw error;
    }
  }
}
