// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface MockReviewDto {
  /**
   * Reviewer display name — fills the {{reviewer_name}} placeholder.
   */
  reviewerName: string;
  /**
   * Star rating (1-5) — fills {{rating}}. A real review would also drive which category the classification pipeline sends it to (PLAN.md §5); here the category is chosen directly instead, since no classifier feeds this route.
   */
  rating: number;
  /**
   * The review body text — fills {{review_text}}.
   */
  reviewText: string;
}
