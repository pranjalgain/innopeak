import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';

import { classifyReview } from './review-classification.rule';
import type { ClassifiableReview, ClassificationContext } from './types/classification-result.type';

function review(overrides: Partial<ClassifiableReview> = {}): ClassifiableReview {
  return { id: 'review-1', rating: 5, reviewText: 'Great service, will come back.', ...overrides };
}

function context(overrides: Partial<ClassificationContext> = {}): ClassificationContext {
  return { blocklistTerms: [], escalationRatingThreshold: 3, ...overrides };
}

describe('classifyReview', () => {
  it('marks a high rating with no blocklist hit as an auto-reply candidate', () => {
    const result = classifyReview(review({ rating: 5 }), context({ escalationRatingThreshold: 3 }));

    expect(result).toEqual({
      classification: ReviewClassification.AUTO_REPLY_CANDIDATE,
      escalationReason: null,
      matchedKeywords: null,
    });
  });

  it('escalates for a low rating below the threshold', () => {
    const result = classifyReview(
      review({ rating: 2, reviewText: 'Not great, but nothing worth flagging.' }),
      context({ escalationRatingThreshold: 3 })
    );

    expect(result).toEqual({
      classification: ReviewClassification.ESCALATED,
      escalationReason: EscalationReason.LOW_RATING,
      matchedKeywords: null,
    });
  });

  it('does not escalate a rating exactly at the threshold — the rule is strictly less-than', () => {
    const result = classifyReview(review({ rating: 3 }), context({ escalationRatingThreshold: 3 }));

    expect(result.classification).toBe(ReviewClassification.AUTO_REPLY_CANDIDATE);
  });

  it('escalates on a blocklist match even with a perfect rating', () => {
    const result = classifyReview(
      review({ rating: 5, reviewText: 'This place is a total scam, avoid.' }),
      context({ blocklistTerms: ['scam'], escalationRatingThreshold: 3 })
    );

    expect(result).toEqual({
      classification: ReviewClassification.ESCALATED,
      escalationReason: EscalationReason.BLOCKLIST_MATCH,
      matchedKeywords: ['scam'],
    });
  });

  // PLAN.md §8.17: blocklist wins, low_rating is never recorded for the same review.
  it('records only blocklist_match when a review is both low-rated and blocklist-matched', () => {
    const result = classifyReview(
      review({ rating: 1, reviewText: 'Total scam, avoid at all costs.' }),
      context({ blocklistTerms: ['scam'], escalationRatingThreshold: 3 })
    );

    expect(result.escalationReason).toBe(EscalationReason.BLOCKLIST_MATCH);
  });

  it('matches case-insensitively', () => {
    const result = classifyReview(
      review({ reviewText: 'Filed a LAWSUIT over this experience.' }),
      context({ blocklistTerms: ['lawsuit'] })
    );

    expect(result.classification).toBe(ReviewClassification.ESCALATED);
    expect(result.matchedKeywords).toEqual(['lawsuit']);
  });

  it('matches as a substring, not a whole-word match', () => {
    const result = classifyReview(
      review({ reviewText: 'The classroom was spotless.' }),
      context({ blocklistTerms: ['class'] })
    );

    expect(result.matchedKeywords).toEqual(['class']);
  });

  it('records every matched term, not just the first', () => {
    const result = classifyReview(
      review({ reviewText: 'This was a scam and a total lawsuit waiting to happen.' }),
      context({ blocklistTerms: ['scam', 'lawsuit', 'refund fraud'] })
    );

    expect(result.matchedKeywords).toEqual(['scam', 'lawsuit']);
  });

  it('cannot match a blocklist term when the review has no text', () => {
    const result = classifyReview(
      review({ rating: 5, reviewText: null }),
      context({ blocklistTerms: ['scam'] })
    );

    expect(result.classification).toBe(ReviewClassification.AUTO_REPLY_CANDIDATE);
  });

  it('falls through to the rating check when the review has no text and no terms are configured', () => {
    const result = classifyReview(
      review({ rating: 1, reviewText: null }),
      context({ blocklistTerms: [], escalationRatingThreshold: 3 })
    );

    expect(result).toEqual({
      classification: ReviewClassification.ESCALATED,
      escalationReason: EscalationReason.LOW_RATING,
      matchedKeywords: null,
    });
  });
});
