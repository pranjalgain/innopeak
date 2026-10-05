import { describe, expect, it } from 'vitest';

import { extractReviewContext } from './extract-review-context';

describe('extractReviewContext', () => {
  it('extracts rating, reviewer, and review text from the default prompt template shape', () => {
    const prompt =
      'You are replying on behalf of The Coastal Table to a 3-star review from Priya.\n\n' +
      'Review: "Food was good but service was slow."';

    expect(extractReviewContext(prompt)).toEqual({
      rating: 3,
      reviewerName: 'Priya',
      reviewText: 'Food was good but service was slow.',
    });
  });

  it('gracefully returns nulls for a prompt that does not match the expected shape', () => {
    expect(extractReviewContext('Some unrelated custom tenant template.')).toEqual({
      rating: null,
      reviewerName: null,
      reviewText: null,
    });
  });
});
