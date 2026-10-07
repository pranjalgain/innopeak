import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';

import type {
  ClassifiableReview,
  ClassificationContext,
  ClassificationResult,
} from './types/classification-result.type';

/**
 * A blocklist match escalates before the rating is looked at, and that order is load-bearing: a review that is both
 * low-rated and blocklist-matched only records `blocklist_match`, since `escalationReason` holds one value.
 * Pure and synchronous (no DB or clock) so fixtures give deterministic answers. Sentiment is deliberately never read: it is informational only.
 */
export function classifyReview(
  review: ClassifiableReview,
  context: ClassificationContext
): ClassificationResult {
  const matchedKeywords = findMatchedKeywords(review.reviewText, context.blocklistTerms);
  if (matchedKeywords.length > 0) {
    return {
      classification: ReviewClassification.ESCALATED,
      escalationReason: EscalationReason.BLOCKLIST_MATCH,
      matchedKeywords,
    };
  }

  if (review.rating < context.escalationRatingThreshold) {
    return {
      classification: ReviewClassification.ESCALATED,
      escalationReason: EscalationReason.LOW_RATING,
      matchedKeywords: null,
    };
  }

  return {
    classification: ReviewClassification.AUTO_REPLY_CANDIDATE,
    escalationReason: null,
    matchedKeywords: null,
  };
}

/**
 * Case-insensitive substring containment; the only match mode implemented (an `exact`/`regex` `match_type` is a possible follow-up).
 * A review with no text (Google allows a rating alone) never matches.
 */
function findMatchedKeywords(reviewText: string | null, blocklistTerms: string[]): string[] {
  if (reviewText === null || blocklistTerms.length === 0) {
    return [];
  }

  const haystack = reviewText.toLowerCase();
  return blocklistTerms.filter(term => haystack.includes(term.toLowerCase()));
}
