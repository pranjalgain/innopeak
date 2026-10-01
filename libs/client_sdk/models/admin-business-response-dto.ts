// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface AdminBusinessResponseDto {
  id: string;
  name: string;
  /**
   * Collapses the real tenant_status\'s pending_activation into active.
   */
  status: AdminBusinessResponseDtoStatusEnum;
  connectionStatus: AdminBusinessResponseDtoConnectionStatusEnum;
  ownerName: string;
  ownerEmail: string;
  userCount: number;
  createdAt: string;
  /**
   * Set once erasure has been requested for this tenant — null means no erasure is pending. Combine with `ERASURE_GRACE_PERIOD_DAYS` to show when it takes effect.
   */
  erasureRequestedAt?: object | null;
}

export const AdminBusinessResponseDtoStatusEnum = {
  Active: 'active',
  Suspended: 'suspended',
  Erased: 'erased',
} as const;

export type AdminBusinessResponseDtoStatusEnum =
  (typeof AdminBusinessResponseDtoStatusEnum)[keyof typeof AdminBusinessResponseDtoStatusEnum];
export const AdminBusinessResponseDtoConnectionStatusEnum = {
  Connected: 'connected',
  NeedsReauth: 'needs_reauth',
  Disconnected: 'disconnected',
  NeverConnected: 'never_connected',
} as const;

export type AdminBusinessResponseDtoConnectionStatusEnum =
  (typeof AdminBusinessResponseDtoConnectionStatusEnum)[keyof typeof AdminBusinessResponseDtoConnectionStatusEnum];
