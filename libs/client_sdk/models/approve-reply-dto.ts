// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ApproveReplyDto {
  /**
   * Edited reply text. Omit to approve the draft as-is. If different from the AI draft\'s original content, the response is recorded as human_edited.
   */
  content?: string;
}
