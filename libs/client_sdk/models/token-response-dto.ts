// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { AuthenticatedUserDto } from './authenticated-user-dto';

export interface TokenResponseDto {
  accessToken: string;
  /**
   * Access token TTL, in seconds.
   */
  expiresIn: number;
  user: AuthenticatedUserDto;
  /**
   * Whether this tenant has connected a Google Business Profile — the frontend routes to the connect stepper instead of the dashboard when this is false.
   */
  hasConnectedBusiness: boolean;
}
