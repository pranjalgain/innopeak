import { MOCK_REVIEWS_WITH_REPLIES, mockReviewsResponse } from './__fixtures__/gbp-reviews.fixture';
import { mapGbpReview, mapGbpReviewPage } from './gbp-review.mapper';

import { ProviderMappingError } from '../errors/provider.error';
import type { GbpReview } from '../types/gbp-wire.type';

const BASE: GbpReview = {
  name: 'accounts/1/locations/2/reviews/abc123',
  starRating: 'FIVE',
  createTime: '2026-03-11T18:22:04.129Z',
  updateTime: '2026-03-11T18:22:04.129Z',
};

describe('mapGbpReview', () => {
  it('takes the review id from the last segment of the resource path', () => {
    // The full path embeds account and location, so a reconnected account would import the same review twice.
    expect(mapGbpReview(BASE).externalReviewId).toBe('abc123');
  });

  it('prefers an explicit reviewId when Google sends one', () => {
    expect(mapGbpReview({ ...BASE, reviewId: 'explicit' }).externalReviewId).toBe('explicit');
  });

  it('maps the starRating word to an integer', () => {
    expect(mapGbpReview({ ...BASE, starRating: 'ONE' }).rating).toBe(1);
  });

  it('throws rather than importing a review whose rating cannot be mapped', () => {
    expect(() => mapGbpReview({ ...BASE, starRating: 'STAR_RATING_UNSPECIFIED' })).toThrow(
      ProviderMappingError
    );
  });

  it('maps a rating-only review to null text, not an empty string', () => {
    // null keeps "left no text" distinguishable from "left an empty string" for the classifier.
    expect(mapGbpReview(BASE).text).toBeNull();
  });

  it('maps an anonymous reviewer to a null name rather than crashing', () => {
    expect(mapGbpReview(BASE).reviewerName).toBeNull();
    expect(mapGbpReview({ ...BASE, reviewer: {} }).reviewerName).toBeNull();
  });

  it('records no external reviewer id, since Google exposes no stable one', () => {
    expect(
      mapGbpReview({ ...BASE, reviewer: { displayName: 'Ada' } }).externalReviewerId
    ).toBeNull();
  });

  it('extracts the owner reply that the backfill imports', () => {
    const mapped = mapGbpReview({
      ...BASE,
      reviewReply: { comment: 'Thanks!', updateTime: '2026-03-12T09:01:11.402Z' },
    });

    expect(mapped.reply).toEqual({ comment: 'Thanks!', updatedAt: '2026-03-12T09:01:11.402Z' });
  });

  it('maps a review with no reply to a null reply', () => {
    expect(mapGbpReview(BASE).reply).toBeNull();
  });

  describe('reviewReplyState', () => {
    const reply = { comment: 'Thanks!', updateTime: '2026-03-12T09:01:11.402Z' } as const;

    it('keeps an APPROVED reply — the only state that is public on Google', () => {
      expect(
        mapGbpReview({ ...BASE, reviewReply: { ...reply, reviewReplyState: 'APPROVED' } }).reply
      ).not.toBeNull();
    });

    it('drops a REJECTED reply rather than importing a policy violation as "posted"', () => {
      // The AI imitates posted replies as the owner's voice; a rejected reply was never public.
      expect(
        mapGbpReview({ ...BASE, reviewReply: { ...reply, reviewReplyState: 'REJECTED' } }).reply
      ).toBeNull();
    });

    it('drops a PENDING reply — not public until moderation approves it', () => {
      expect(
        mapGbpReview({ ...BASE, reviewReply: { ...reply, reviewReplyState: 'PENDING' } }).reply
      ).toBeNull();
    });

    it('treats a missing state as approved, so older payloads and fixtures still import', () => {
      expect(mapGbpReview({ ...BASE, reviewReply: reply }).reply).not.toBeNull();
    });
  });

  it('keeps a reply whose timestamp predates its review', () => {
    // Real provider data contains this — an edited review keeps its original reply's updateTime.
    // Nothing here may "correct" it; code downstream that assumes reply-after-review is the bug.
    const mapped = mapGbpReview({
      ...BASE,
      reviewReply: { comment: 'Earlier', updateTime: '2026-03-10T09:00:00.000Z' },
    });

    expect(mapped.reply).not.toBeNull();
    expect(new Date(mapped.reply?.updatedAt ?? 0).getTime()).toBeLessThan(
      new Date(mapped.reviewedAt).getTime()
    );
  });
});

describe('mapGbpReviewPage', () => {
  it('reports the provider total when there is one', () => {
    expect(mapGbpReviewPage(mockReviewsResponse()).totalCount).toBe(20);
  });

  it('reports a null total rather than substituting the page length', () => {
    // A per-page count posing as a total makes progress hit 100% on page one.
    const page = mapGbpReviewPage({ reviews: [BASE] });
    expect(page.totalCount).toBeNull();
    expect(page.reviews).toHaveLength(1);
  });

  it('maps an empty page without a nextPageToken', () => {
    expect(mapGbpReviewPage({})).toEqual({
      reviews: [],
      nextPageToken: null,
      totalCount: null,
      averageRating: null,
    });
  });

  it("carries Google's overall rating, and leaves it null on a page that does not send one", () => {
    expect(mapGbpReviewPage({ totalReviewCount: 212, averageRating: 4.3 })).toMatchObject({
      totalCount: 212,
      averageRating: 4.3,
    });
    expect(mapGbpReviewPage({ reviews: [] }).averageRating).toBeNull();
  });

  it('paginates the fixtures over two pages and terminates', () => {
    const first = mapGbpReviewPage(mockReviewsResponse());
    expect(first.nextPageToken).not.toBeNull();

    const second = mapGbpReviewPage(mockReviewsResponse(first.nextPageToken ?? undefined));
    expect(second.nextPageToken).toBeNull();
    expect(first.reviews.length + second.reviews.length).toBe(20);
  });

  it('maps every fixture review, including the deliberate edge cases', () => {
    const all = [
      ...mapGbpReviewPage(mockReviewsResponse()).reviews,
      ...mapGbpReviewPage(mockReviewsResponse('mock-page-2')).reviews,
    ];

    expect(all).toHaveLength(20);
    expect(all.every(review => review.rating >= 1 && review.rating <= 5)).toBe(true);
    expect(all.some(review => review.text === null)).toBe(true);
    expect(all.some(review => review.reviewerName === null)).toBe(true);
    expect(all.some(review => review.rating === 1)).toBe(true);
    // The fixtures carry one REJECTED reply that must be dropped.
    expect(all.filter(review => review.reply !== null)).toHaveLength(MOCK_REVIEWS_WITH_REPLIES);
    expect(all.find(review => review.externalReviewId === 'ptl-008')?.reply).toBeNull();
  });

  // Real Google fields, but this product has no review-media feature and never links to Google's reply UI.
  it('discards reviewMediaItems and reviewReplyUrl rather than carrying them through', () => {
    const mapped = mapGbpReview({
      ...BASE,
      reviewMediaItems: [{ mediaFormat: 'PHOTO', name: 'accounts/1/media/xyz' }],
      reviewReplyUrl: 'https://business.google.com/reviews/reply/abc123',
    });

    expect(mapped).not.toHaveProperty('reviewMediaItems');
    expect(mapped).not.toHaveProperty('reviewReplyUrl');
  });
});
