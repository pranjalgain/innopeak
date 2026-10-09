// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface SelectAccountResponseDto {
  connectionId: string;
  accountId: string;
  /**
   * The screen that started the connect flow. `settings`: go to Settings → Connection; `onboarding`: carry on choosing locations.
   */
  returnTo: SelectAccountResponseDtoReturnToEnum;
}

export const SelectAccountResponseDtoReturnToEnum = {
  Onboarding: 'onboarding',
  Settings: 'settings',
} as const;

export type SelectAccountResponseDtoReturnToEnum =
  (typeof SelectAccountResponseDtoReturnToEnum)[keyof typeof SelectAccountResponseDtoReturnToEnum];
