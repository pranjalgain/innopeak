import { ReviewClassification } from '@common/enums/review-classification.enum';
import type { PromptCategory } from '@prompts/types/prompt.type';

/** Just the two fields `resolvePromptCategoryForReview` reads — never the whole row. */
export interface CategorizableReview {
  rating: number;
  classification: ReviewClassification.AUTO_REPLY_CANDIDATE | ReviewClassification.ESCALATED;
}

/**
 * Maps a classified review to which of the tenant's three prompts (`PromptCategory`) generates
 * its reply — a decision `review-classification.rule.ts` never makes, because `classification`
 * answers a different question ("does a human need to look at this before it goes out") than
 * "which house-style prompt fits its tone." The two axes agree in the common case but aren't the
 * same thing: `classification = ESCALATED` can come from a blocklist match on an otherwise
 * glowing review, not only a low rating.
 *
 * Pure and synchronous, mirroring `classifyReview`'s own reasoning for being so — a caller can
 * evaluate it against a fixture review and get a deterministic answer with no DB/clock involved.
 *
 * - `ESCALATED` (either reason) always maps to `'escalated'` — `DEFAULT_PROMPTS`' own category
 *   description ("Used for 1-2 star reviews and reviews escalated to the team") already covers
 *   both origins, so a 5-star review escalated only for a blocklisted word still gets the
 *   apologetic house style meant for something a human is about to read before it posts.
 * - `AUTO_REPLY_CANDIDATE` is banded by rating: 4-5 stars → `'positive'`, 3 stars → `'neutral'`.
 *   A 1-2 star `AUTO_REPLY_CANDIDATE` is possible (a tenant can configure
 *   `escalation_rating_threshold` below 3, or even to 1) and is deliberately folded into
 *   `'escalated'` too, for the same reason as the paragraph above — the content of a 1-2 star
 *   review calls for that house style independent of whether this tenant's own threshold happens
 *   to route it through human review first.
 */
export function resolvePromptCategoryForReview(review: CategorizableReview): PromptCategory {
  if (review.classification === ReviewClassification.ESCALATED) {
    return 'escalated';
  }

  if (review.rating >= 4) {
    return 'positive';
  }

  if (review.rating === 3) {
    return 'neutral';
  }

  return 'escalated';
}
