/** `reviews.escalation_reason` — null unless `classification = ESCALATED`. */
export enum EscalationReason {
  LOW_RATING = 'low_rating',
  BLOCKLIST_MATCH = 'blocklist_match',
}
