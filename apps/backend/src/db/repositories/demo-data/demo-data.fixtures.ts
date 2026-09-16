import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewSentiment } from '@common/enums/review-sentiment.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';

export interface DemoLocationFixture {
  slug: 'downtown' | 'uptown';
  suffix: string;
  address: string;
}

/** Two locations, not one — a fresh signup should see the Business Switcher (and the
 *  location-scoped dashboard/review queue it drives) in action immediately, not just a populated
 *  single-location screen indistinguishable from the pre-multi-location app. */
export const DEMO_LOCATIONS: DemoLocationFixture[] = [
  { slug: 'downtown', suffix: 'Downtown', address: '214 Harbor St, Portland, ME' },
  { slug: 'uptown', suffix: 'Uptown', address: '88 Congress St, Portland, ME' },
];

export interface DemoReviewFixture {
  daysAgo: number;
  rating: number;
  reviewerName: string;
  reviewText: string;
  sentiment: ReviewSentiment;
  classification: ReviewClassification;
  escalationReason: EscalationReason | null;
  status: ReviewStatus;
}

/**
 * Deliberately varied, not just "five 5-star reviews" — every stat card, the rating-distribution
 * chart, and every Review Queue filter (status, classification, search) should have something
 * real to show, and `daysAgo` is spread across all three date-range tabs (7d/30d/90d) so switching
 * ranges visibly changes the numbers instead of always showing the same fixed set.
 */
const DOWNTOWN_REVIEWS: DemoReviewFixture[] = [
  {
    daysAgo: 1,
    rating: 5,
    reviewerName: 'Maria Chen',
    reviewText:
      'Best coffee in the neighborhood, and the staff remembered my order on my second visit!',
    sentiment: ReviewSentiment.POSITIVE,
    classification: ReviewClassification.PENDING_CLASSIFICATION,
    escalationReason: null,
    status: ReviewStatus.NEW,
  },
  {
    daysAgo: 3,
    rating: 1,
    reviewerName: 'Jordan Pierce',
    reviewText: 'Waited 40 minutes and the order was still wrong when it arrived.',
    sentiment: ReviewSentiment.NEGATIVE,
    classification: ReviewClassification.ESCALATED,
    escalationReason: EscalationReason.LOW_RATING,
    status: ReviewStatus.NEW,
  },
  {
    daysAgo: 9,
    rating: 4,
    reviewerName: 'Priya Natarajan',
    reviewText: 'Great atmosphere for working, wifi is solid and outlets at every table.',
    sentiment: ReviewSentiment.POSITIVE,
    classification: ReviewClassification.AUTO_REPLY_CANDIDATE,
    escalationReason: null,
    status: ReviewStatus.RESPONDED,
  },
  {
    daysAgo: 18,
    rating: 3,
    reviewerName: 'Sam Okafor',
    reviewText: 'Food was fine, nothing special. Parking is a hassle though.',
    sentiment: ReviewSentiment.NEUTRAL,
    classification: ReviewClassification.PENDING_CLASSIFICATION,
    escalationReason: null,
    status: ReviewStatus.IN_REVIEW,
  },
  {
    daysAgo: 42,
    rating: 5,
    reviewerName: 'Elena Vasquez',
    reviewText: 'Celebrated my birthday here, the team went above and beyond. Highly recommend!',
    sentiment: ReviewSentiment.POSITIVE,
    classification: ReviewClassification.PENDING_CLASSIFICATION,
    escalationReason: null,
    status: ReviewStatus.DISMISSED,
  },
];

const UPTOWN_REVIEWS: DemoReviewFixture[] = [
  {
    daysAgo: 2,
    rating: 5,
    reviewerName: 'Tomas Reyes',
    reviewText: 'Uptown location has the same great quality, quieter and easier to park too.',
    sentiment: ReviewSentiment.POSITIVE,
    classification: ReviewClassification.PENDING_CLASSIFICATION,
    escalationReason: null,
    status: ReviewStatus.NEW,
  },
  {
    daysAgo: 6,
    rating: 2,
    reviewerName: 'Aisha Bello',
    reviewText: "Table wasn't cleared for a while after the previous guests left.",
    sentiment: ReviewSentiment.NEGATIVE,
    classification: ReviewClassification.ESCALATED,
    escalationReason: EscalationReason.LOW_RATING,
    status: ReviewStatus.NEW,
  },
  {
    daysAgo: 14,
    rating: 4,
    reviewerName: 'Liam Foster',
    reviewText: 'Solid lunch spot, quick service even during the rush.',
    sentiment: ReviewSentiment.POSITIVE,
    classification: ReviewClassification.AUTO_REPLY_CANDIDATE,
    escalationReason: null,
    status: ReviewStatus.RESPONDED,
  },
  {
    daysAgo: 27,
    rating: 3,
    reviewerName: 'Nadia Kowalski',
    reviewText: "Decent, but I've had better versions of the same dish elsewhere.",
    sentiment: ReviewSentiment.NEUTRAL,
    classification: ReviewClassification.PENDING_CLASSIFICATION,
    escalationReason: null,
    status: ReviewStatus.IN_REVIEW,
  },
  {
    daysAgo: 70,
    rating: 5,
    reviewerName: 'Derek Huang',
    reviewText: 'Our go-to spot for client lunches. Never disappoints.',
    sentiment: ReviewSentiment.POSITIVE,
    classification: ReviewClassification.PENDING_CLASSIFICATION,
    escalationReason: null,
    status: ReviewStatus.NEW,
  },
];

export const DEMO_REVIEWS_BY_LOCATION_SLUG: Record<
  DemoLocationFixture['slug'],
  DemoReviewFixture[]
> = {
  downtown: DOWNTOWN_REVIEWS,
  uptown: UPTOWN_REVIEWS,
};
