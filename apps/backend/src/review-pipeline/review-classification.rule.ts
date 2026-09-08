import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';

import type {
  ClassifiableReview,
  ClassificationContext,
  ClassificationResult,
} from './types/classification-result.type';

/**
 * PLAN.md §3's classification rule, exactly as its flowchart orders it: a blocklist match
 * escalates before the rating is even looked at. That order is load-bearing, not incidental —
 * §8.17 accepts that a review which is *both* low-rated and blocklist-matched only ever records
 * `blocklist_match`, because this check runs first and `escalationReason` has room for one value.
 *
 * Pure and synchronous on purpose: nothing here reads the database or a clock, so a caller can
 * evaluate it for a fixture review with a fixture context and get a deterministic answer — the
 * classification decision is exactly this function, nothing more. Sentiment is deliberately never
 * read here — §3 marks it informational-only, not a routing input.
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
 * Case-insensitive substring containment — PLAN.md's own `blocklist_terms` notes defer a
 * `match_type` (`exact`/`contains`/`regex`) enum as "a possible fast-follow, not required for
 * MVP," so `contains` is the one mode this deliberately implements. A review with no text (Google
 * allows a star rating alone) can never match, same as an empty blocklist.
 */
function findMatchedKeywords(reviewText: string | null, blocklistTerms: string[]): string[] {
  if (reviewText === null || blocklistTerms.length === 0) {
    return [];
  }

  const haystack = reviewText.toLowerCase();
  return blocklistTerms.filter(term => haystack.includes(term.toLowerCase()));
}
