export interface WebhookRecord {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDeliveryRecord {
  id: string;
  webhookId: string;
  event: string;
  payload: unknown;
  responseStatus: number | null;
  responseBody: string | null;
  attempt: number;
  deliveredAt: Date | null;
  nextRetryAt: Date | null;
  status: string;
  createdAt: Date;
}

export interface CreateWebhookData {
  userId: string;
  url: string;
  secret: string;
  events: string[];
  description?: string;
}

export interface UpdateWebhookData {
  url?: string;
  events?: string[];
  isActive?: boolean;
  description?: string | null;
}

export interface CreateDeliveryData {
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface UpdateDeliveryData {
  responseStatus?: number;
  responseBody?: string;
  attempt?: number;
  deliveredAt?: Date;
  nextRetryAt?: Date | null;
  status: string;
}

export interface WebhookDispatchPayload {
  webhookId: string;
  deliveryId: string;
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
}
