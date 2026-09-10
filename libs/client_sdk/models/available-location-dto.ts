// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface AvailableLocationDto {
  externalLocationId: string;
  name: string;
  address?: object | null;
  /**
   * True when a locations row already exists for this connection + external id.
   */
  alreadyConnected: boolean;
}
