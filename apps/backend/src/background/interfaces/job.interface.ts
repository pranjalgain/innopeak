import type { CronJobName, QueueName } from '@bg/constants/job.constant';

export interface IEmailJob {
  email: string;
  customerName?: string;
}

export interface IOtpEmailJob extends IEmailJob {
  otp: number;
  passwordResetLink?: string;
  passwordSetLink?: string;
}

export interface IMediaUploadJob {
  file: Express.Multer.File;
  metadata?: Record<string, unknown>;
}

export interface ICronJob {
  jobType: CronJobName;
  data?: Record<string, unknown> | undefined;
  options?: {
    priority?: number;
    timestamp?: number;
  };
}

export interface INotificationJob {
  deviceFids: string[];
  subject: string;
  message: string;
  url: string;
  data: Record<string, unknown>;
}

export interface INotificationTopicJob {
  topic: string;
  subject: string;
  message: string;
  url: string;
  data: Record<string, unknown>;
}

export interface ISendNotificationJob {
  user_ids: string[];
  subject: string;
  message: string;
  url: string;
  notification_type: string;
  data?: Record<string, unknown>;
}

export interface IWebhookDeliveryJob {
  webhookId: string;
  deliveryId: string;
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface IDLQFailedJobData {
  originalQueueName: QueueName;
  originalJobId: string;
  originalJobName: string;
  originalJobData: unknown;
  failedReason: string;
  stacktrace?: string[];
  timestamp: number;
}
