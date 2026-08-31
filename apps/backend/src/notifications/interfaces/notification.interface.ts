export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  data: unknown;
  channel: string;
  isRead: boolean;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface SendNotificationOptions {
  userId: string;
  title: string;
  body: string;
  type: string;
  channel: 'email' | 'in-app' | 'push' | 'sms';
  data?: Record<string, unknown>;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Firebase Installation IDs (not FCM registration tokens — see fcm.provider.ts). */
  fids: string[];
}
