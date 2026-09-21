// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface DisconnectResponseDto {
  provider: DisconnectResponseDtoProviderEnum;
  deactivatedLocationIds: Array<string>;
  /**
   * False when the provider\'s revoke call failed. The local deactivation still succeeded — leaving a tenant unable to disconnect is worse than an unrevoked upstream grant.
   */
  credentialRevoked: boolean;
  pollingStopped: boolean;
}

export const DisconnectResponseDtoProviderEnum = {
  Google: 'google',
} as const;

export type DisconnectResponseDtoProviderEnum =
  (typeof DisconnectResponseDtoProviderEnum)[keyof typeof DisconnectResponseDtoProviderEnum];
