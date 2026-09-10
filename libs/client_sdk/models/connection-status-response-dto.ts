// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { ConnectionLocationDto } from './connection-location-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { ConnectionSummaryDto } from './connection-summary-dto';

export interface ConnectionStatusResponseDto {
  /**
   * True only when an active connection AND an active location both exist.
   */
  connected: boolean;
  status: ConnectionStatusResponseDtoStatusEnum;
  connection?: ConnectionSummaryDto | null;
  location?: ConnectionLocationDto | null;
}

export const ConnectionStatusResponseDtoStatusEnum = {
  Connected: 'connected',
  Disconnected: 'disconnected',
} as const;

export type ConnectionStatusResponseDtoStatusEnum =
  (typeof ConnectionStatusResponseDtoStatusEnum)[keyof typeof ConnectionStatusResponseDtoStatusEnum];
