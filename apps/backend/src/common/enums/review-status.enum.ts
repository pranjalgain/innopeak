/** `reviews.status` — the review's own queue-level lifecycle only, independent of `classification`. */
export enum ReviewStatus {
  NEW = 'new',
  IN_REVIEW = 'in_review',
  RESPONDED = 'responded',
  DISMISSED = 'dismissed',
}
