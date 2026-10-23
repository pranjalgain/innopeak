import type { NotificationChannelPref } from '@common/enums/notification-channel-pref.enum';

export interface BlocklistTermRecord {
  id: string;
  term: string;
  createdAt: string;
}

export interface CreateBlocklistTermInput {
  tenantId: string;
  term: string;
  /** Checked in the insert's transaction so two concurrent adds can't both slip under it. */
  maxTerms: number;
}

export type InsertBlocklistTermResult =
  | { outcome: 'created'; record: BlocklistTermRecord }
  | { outcome: 'duplicate' }
  | { outcome: 'limit_reached' };

export interface DeleteBlocklistTermInput {
  id: string;
  tenantId: string;
}

export interface NotificationRecipientRecord {
  id: string;
  userId: string;
  /** Null once the user was anonymized in place (GDPR erasure keeps the recipient row); the API layer picks the label. */
  name: string | null;
  channel: NotificationChannelPref;
  isActive: boolean;
}

export interface UpdateNotificationRecipientInput {
  id: string;
  tenantId: string;
  channel?: NotificationChannelPref;
  isActive?: boolean;
}

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
