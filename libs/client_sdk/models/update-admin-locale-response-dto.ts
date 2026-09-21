// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { AdminProfileResponseDto } from './admin-profile-response-dto';

export interface UpdateAdminLocaleResponseDto {
  accessToken: string;
  /**
   * Access token TTL, in seconds.
   */
  expiresIn: number;
  admin: AdminProfileResponseDto;
}
