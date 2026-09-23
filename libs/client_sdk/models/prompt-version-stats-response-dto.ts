// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface PromptVersionStatsResponseDto {
  totalGenerated: number;
  approvedCount: number;
  approvedAsIsCount: number;
  approvedEditedCount: number;
  rejectedCount: number;
  pendingCount: number;
  supersededCount: number;
  averageDecisionMinutes: number | null;
}
