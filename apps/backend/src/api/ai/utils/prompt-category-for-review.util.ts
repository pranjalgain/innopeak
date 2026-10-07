import { ReviewClassification } from '@common/enums/review-classification.enum';
import type { PromptCategory } from '@prompts/types/prompt.type';

export interface CategorizableReview {
  rating: number;
  classification: ReviewClassification.AUTO_REPLY_CANDIDATE | ReviewClassification.ESCALATED;
}

/**
 * Classification answers "does a human review this", not "which tone fits", so the axes differ:
 * a 5-star review escalated for a blocklisted word still gets the `'escalated'` prompt, and a
 * 1-2 star auto-reply candidate (possible when `escalation_rating_threshold` < 3) is folded into
 * `'escalated'` too.
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
