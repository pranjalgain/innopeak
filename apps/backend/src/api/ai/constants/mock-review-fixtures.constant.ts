import type { PromptCategory } from '@prompts/types/prompt.type';

export interface MockReviewFixture {
  key: string;
  description: string;
  category: PromptCategory;
  reviewerName: string;
  rating: number;
  reviewText: string;
}

/**
 * Shared by `scripts/ai-dry-run.script.ts` and `GenerateReplyDryRunDto`'s Swagger examples. Includes
 * a long 1-star (word-limit instruction) and a non-English review (reply-in-the-same-language).
 */
export const MOCK_REVIEW_FIXTURES: readonly MockReviewFixture[] = [
  {
    key: 'positive-short',
    description: '5-star, short and specific',
    category: 'positive',
    reviewerName: 'Jamie L.',
    rating: 5,
    reviewText:
      'Amazing coffee and the staff remembered my order from last time! Will definitely be back.',
  },
  {
    key: 'neutral-mixed',
    description: '3-star, both positive and constructive feedback',
    category: 'neutral',
    reviewerName: 'Priya K.',
    rating: 3,
    reviewText:
      'The food itself was really good, but we had a reservation and still waited almost 30 minutes for a table.',
  },
  {
    key: 'escalated-rude',
    description: '1-star, an unhappy customer describing a specific service failure',
    category: 'escalated',
    reviewerName: 'Anonymous',
    rating: 1,
    reviewText:
      'Waited over an hour for our order, the food arrived cold, and the manager was dismissive when I raised it.',
  },
  {
    key: 'escalated-rambling',
    description: '1-star, long and unstructured — checks the word-limit instruction under pressure',
    category: 'escalated',
    reviewerName: 'Marcus T.',
    rating: 1,
    reviewText:
      "I don't even know where to start honestly. We booked this place for my mother's birthday " +
      'two weeks in advance and specifically asked for a quiet table, which was completely ' +
      'ignored — we were seated right next to the kitchen doors. Then it took forever just to get ' +
      'someone to take our order, and when the food finally came, two of the six dishes were ' +
      "wrong and had to be sent back. The waiter didn't apologize once, and when we asked to speak " +
      'to a manager we were told they were "busy" for the entire rest of the meal. Genuinely one ' +
      'of the worst dining experiences we have had in years and I say that as someone who eats out ' +
      'multiple times a week.',
  },
  {
    key: 'positive-non-english',
    description: 'Spanish-language review with a Google machine translation appended',
    category: 'positive',
    reviewerName: 'Sofia R.',
    rating: 5,
    reviewText:
      'Excelente servicio y comida deliciosa, volveremos pronto. ' +
      '(Translated by Google) Excellent service and delicious food, we will be back soon.',
  },
];
