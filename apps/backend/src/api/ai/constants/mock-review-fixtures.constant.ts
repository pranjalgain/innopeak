import type { PromptCategory } from '@prompts/types/prompt.type';

import { NO_WRITTEN_COMMENT } from './ai.constants';

export interface MockReviewFixture {
  key: string;
  description: string;
  category: PromptCategory;
  reviewerName: string;
  rating: number;
  reviewText: string;
}

/**
 * Used by `scripts/ai-dry-run.script.ts` to judge prompt changes. Covers the cases that go wrong in practice: a long 1-star (word
 * limit), non-English reviews (same language, and formal German), a star-only review (nothing to invent from), a named member of staff
 * (the name must not be repeated), and a demand for money back (no promises).
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
  {
    key: 'positive-four-star-caveat',
    description: '4-star, praise with a small complaint',
    category: 'positive',
    reviewerName: 'Tom B.',
    rating: 4,
    reviewText: 'Really good pizza and quick service. It was a bit too loud to talk, though.',
  },
  {
    key: 'positive-rating-only',
    description: '5-star with no written comment: there is nothing specific to refer to',
    category: 'positive',
    reviewerName: 'Alex M.',
    rating: 5,
    reviewText: NO_WRITTEN_COMMENT,
  },
  {
    key: 'escalated-staff-named',
    description: '1-star blaming a named member of staff: the name must not be repeated',
    category: 'escalated',
    reviewerName: 'Nora V.',
    rating: 1,
    reviewText:
      'Our waiter Stefan was rude and rolled his eyes when we asked about the allergens. Never again.',
  },
  {
    key: 'escalated-refund-demand',
    description: '1-star demanding money back: no promise of a refund or compensation',
    category: 'escalated',
    reviewerName: 'Chris D.',
    rating: 1,
    reviewText:
      'Absolute scam. Overcharged on the bill and nobody cared. I want my money back immediately or I will report you.',
  },
  {
    key: 'escalated-german',
    description: 'German-language 2-star (the client is Austrian): reply in German, formal "Sie"',
    category: 'escalated',
    reviewerName: 'Katharina H.',
    rating: 2,
    reviewText:
      'Das Essen war lauwarm und die Bedienung ziemlich unfreundlich. Schade, wir hatten uns mehr erwartet.',
  },
];
