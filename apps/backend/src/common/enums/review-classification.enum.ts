/** `reviews.classification` — the routing decision. `PENDING_CLASSIFICATION` is the DB default,
 * never `NULL`; a review the classifier hasn't reached yet reads as this, not absent. */
export enum ReviewClassification {
  AUTO_REPLY_CANDIDATE = 'auto_reply_candidate',
  ESCALATED = 'escalated',
  PENDING_CLASSIFICATION = 'pending_classification',
}
