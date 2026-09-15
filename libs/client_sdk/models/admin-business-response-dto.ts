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
}

export const AdminBusinessResponseDtoStatusEnum = {
  Active: 'active',
  Suspended: 'suspended',
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
