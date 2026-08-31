import type { PushNotificationPayload } from '../interfaces/notification.interface';

export interface PushSendResult {
  successCount: number;
  failureCount: number;
}

export abstract class PushProvider {
  abstract sendToDevices(payload: PushNotificationPayload): Promise<PushSendResult>;

  abstract sendToTopic(
    topic: string,
    payload: Omit<PushNotificationPayload, 'fids'>
  ): Promise<void>;
}
