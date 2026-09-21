// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface RecentEscalatedDto {
  id: string;
  reviewerName?: string | null;
  rating: number;
  reviewText?: string | null;
  /**
   * Why the classifier escalated this review. Returned rather than left to the client to infer: the two reasons are independent of the star rating, so a 5-star blocklist match and a 1-star rating escalation are both routine.
   */
  escalationReason?: RecentEscalatedDtoEscalationReasonEnum | null;
  /**
   * When the reviewer left the review, not when the row was imported.
   */
  reviewedAt?: string | null;
}

export const RecentEscalatedDtoEscalationReasonEnum = {
  LowRating: 'low_rating',
  BlocklistMatch: 'blocklist_match',
} as const;

export type RecentEscalatedDtoEscalationReasonEnum =
  (typeof RecentEscalatedDtoEscalationReasonEnum)[keyof typeof RecentEscalatedDtoEscalationReasonEnum];
