// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ConnectionHealthResponseDto {
  /**
   * Tenants whose most recent connection is healthy.
   */
  connected: number;
  /**
   * Tenants whose most recent connection needs re-auth.
   */
  needsReauth: number;
  /**
   * Tenants that had a working connection and lost it (owner action or revocation).
   */
  disconnected: number;
  /**
   * Tenants that never finished connecting a business.
   */
  neverConnected: number;
}
