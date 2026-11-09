// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { PlatformSettingChangeDto } from './platform-setting-change-dto';

export interface PlatformActivityDetailsDto {
  changes: Array<PlatformSettingChangeDto>;
  /**
   * Present when the admin confirmed switching a provider off although users could then only sign in with it.
   */
  lockoutConfirmed?: boolean;
}
