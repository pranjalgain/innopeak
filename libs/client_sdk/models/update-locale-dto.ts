// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface UpdateLocaleDto {
  /**
   * The language the user wants API responses rendered in from now on.
   */
  locale: UpdateLocaleDtoLocaleEnum;
}

export const UpdateLocaleDtoLocaleEnum = {
  En: 'en',
  De: 'de',
} as const;

export type UpdateLocaleDtoLocaleEnum =
  (typeof UpdateLocaleDtoLocaleEnum)[keyof typeof UpdateLocaleDtoLocaleEnum];
