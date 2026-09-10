// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface CreatePromptVersionDto {
  /**
   * New template text (max 1000). Sanitized then validated for required {{placeholders}}. Appends a version; never overwrites.
   */
  template: string;
}
