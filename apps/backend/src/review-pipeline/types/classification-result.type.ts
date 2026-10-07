import type { EscalationReason } from '@common/enums/escalation-reason.enum';
import type { ReviewClassification } from '@common/enums/review-classification.enum';

/** Never `PENDING_CLASSIFICATION`: that only describes a row the rule hasn't reached yet. */
export interface ClassificationResult {
  classification: ReviewClassification.AUTO_REPLY_CANDIDATE | ReviewClassification.ESCALATED;
  /** Non-null exactly when `classification = ESCALATED`. A review matching both rules still records one reason. */
  escalationReason: EscalationReason | null;
  /** Non-null exactly when `escalationReason = BLOCKLIST_MATCH`. */
  matchedKeywords: string[] | null;
}

/** Read once per `classifyPendingReviews` call; a mid-run threshold/blocklist change deliberately doesn't reclassify. */
export interface ClassificationContext {
  blocklistTerms: string[];
  escalationRatingThreshold: number;
}

export interface ClassifiableReview {
  id: string;
  rating: number;
  reviewText: string | null;
}

export interface ClassifyPendingReviewsInput {
  tenantId: string;
  locationId: string;
}

export interface ClassifyPendingReviewsResult {
  classified: number;
  /** Lost the claim CAS: another worker classified it first, or it stopped being `new` meanwhile. */
  skipped: number;
}
