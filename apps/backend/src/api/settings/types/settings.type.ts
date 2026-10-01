import type { NotificationChannelPref } from '@common/enums/notification-channel-pref.enum';

// ─── Blocklist terms ──────────────────────────────────────────────

export interface BlocklistTermRecord {
  id: string;
  term: string;
  createdAt: string;
}

export interface CreateBlocklistTermInput {
  tenantId: string;
  term: string;
}

export interface DeleteBlocklistTermInput {
  id: string;
  tenantId: string;
}

// ─── Notification recipients ──────────────────────────────────────────────

export interface NotificationRecipientRecord {
  id: string;
  userId: string;
  name: string;
  channel: NotificationChannelPref;
  isActive: boolean;
}

export interface UpdateNotificationRecipientInput {
  id: string;
  tenantId: string;
  channel?: NotificationChannelPref;
  isActive?: boolean;
}

// ─── Tenant settings ──────────────────────────────────────────────

export interface TenantSettingsRecord {
  id: string;
  escalationRatingThreshold: number;
  autoPostEnabled: boolean;
  reviewDataRetentionMonths: number | null;
  aiReplyCount: number;
  updatedAt: string;
}

export interface TenantSettingsWrite {
  escalationRatingThreshold: number;
  autoPostEnabled: boolean;
  reviewDataRetentionMonths: number | null;
  aiReplyCount: number;
}
