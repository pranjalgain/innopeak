export interface TenantSettingsRecord {
  id: string;
  escalationRatingThreshold: number;
  autoPostEnabled: boolean;
  reviewDataRetentionMonths: number | null;
  updatedAt: string;
}

export interface TenantSettingsWrite {
  escalationRatingThreshold: number;
  autoPostEnabled: boolean;
  reviewDataRetentionMonths: number | null;
}
