import type { EscalationReason } from '@common/enums/escalation-reason.enum';
import type { ReviewClassification } from '@common/enums/review-classification.enum';

/**
 * What `classifyReview` decides for one review. Never `PENDING_CLASSIFICATION` — that value only
 * ever describes a row the rule hasn't reached yet, never something the rule itself produces.
 */
export interface ClassificationResult {
  classification: ReviewClassification.AUTO_REPLY_CANDIDATE | ReviewClassification.ESCALATED;
  /** Non-null exactly when `classification = ESCALATED` — see PLAN.md §8.17 for why a review that
   *  matches both the blocklist and the rating threshold still only ever records one reason. */
  escalationReason: EscalationReason | null;
  /** Non-null exactly when `escalationReason = BLOCKLIST_MATCH`. */
  matchedKeywords: string[] | null;
}

/**
 * Per-tenant configuration the rule is evaluated against. Read once per `classifyPendingReviews`
 * call, not re-read per review — PLAN.md §8.11 accepts that a threshold/blocklist change mid-run
 * does not retroactively reclassify anything, so there is nothing this would need to stay fresh
 * against.
 */
export interface ClassificationContext {
  blocklistTerms: string[];
  escalationRatingThreshold: number;
}

/** The columns the rule needs from a `reviews` row — never the whole row. */
export interface ClassifiableReview {
  id: string;
  rating: number;
  reviewText: string | null;
}
