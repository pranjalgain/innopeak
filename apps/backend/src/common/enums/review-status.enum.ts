/** `reviews.status` — the review's own queue-level lifecycle only, independent of `classification`. */
export enum ReviewStatus {
  NEW = 'new',
  IN_REVIEW = 'in_review',
  RESPONDED = 'responded',
  DISMISSED = 'dismissed',
  /** Deleted on Google by its author; set with `removed_upstream_at`. Nothing can reply to it any more. */
  REMOVED = 'removed',
}
