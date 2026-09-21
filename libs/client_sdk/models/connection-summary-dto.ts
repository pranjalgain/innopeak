// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ConnectionSummaryDto {
  id: string;
  provider: ConnectionSummaryDtoProviderEnum;
  providerAccountId: string;
  connectionStatus: ConnectionSummaryDtoConnectionStatusEnum;
  tokenExpiresAt?: object | null;
  connectedByUserId: string;
  connectedAt: string;
}

export const ConnectionSummaryDtoProviderEnum = {
  Google: 'google',
} as const;

export type ConnectionSummaryDtoProviderEnum =
  (typeof ConnectionSummaryDtoProviderEnum)[keyof typeof ConnectionSummaryDtoProviderEnum];
export const ConnectionSummaryDtoConnectionStatusEnum = {
  Active: 'active',
  NeedsReauth: 'needs_reauth',
} as const;

export type ConnectionSummaryDtoConnectionStatusEnum =
  (typeof ConnectionSummaryDtoConnectionStatusEnum)[keyof typeof ConnectionSummaryDtoConnectionStatusEnum];
