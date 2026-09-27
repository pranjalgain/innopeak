import { ReviewClassification } from '@common/enums/review-classification.enum';

import { resolvePromptCategoryForReview } from './prompt-category-for-review.util';

describe('resolvePromptCategoryForReview', () => {
  it.each([
    [5, 'positive'],
    [4, 'positive'],
  ])('maps a %i-star AUTO_REPLY_CANDIDATE to %s', (rating, expected) => {
    expect(
      resolvePromptCategoryForReview({
        rating,
        classification: ReviewClassification.AUTO_REPLY_CANDIDATE,
      })
    ).toBe(expected);
  });

  it('maps a 3-star AUTO_REPLY_CANDIDATE to neutral', () => {
    expect(
      resolvePromptCategoryForReview({
        rating: 3,
        classification: ReviewClassification.AUTO_REPLY_CANDIDATE,
      })
    ).toBe('neutral');
  });

  it.each([2, 1])(
    'maps a %i-star AUTO_REPLY_CANDIDATE to escalated (a tenant-configured low threshold)',
    rating => {
      expect(
        resolvePromptCategoryForReview({
          rating,
          classification: ReviewClassification.AUTO_REPLY_CANDIDATE,
        })
      ).toBe('escalated');
    }
  );

  it('maps any ESCALATED review to escalated regardless of rating', () => {
    // The case this test exists for: a 5-star review escalated only for a blocklisted word still
    // gets the apologetic house style, not the positive one its rating alone would suggest.
    expect(
      resolvePromptCategoryForReview({ rating: 5, classification: ReviewClassification.ESCALATED })
    ).toBe('escalated');
    expect(
      resolvePromptCategoryForReview({ rating: 1, classification: ReviewClassification.ESCALATED })
    ).toBe('escalated');
  });
});
