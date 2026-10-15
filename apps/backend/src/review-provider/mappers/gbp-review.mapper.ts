import { ProviderMappingError } from '../errors/provider.error';
import type { GbpListReviewsResponse, GbpReview, GbpReviewReply } from '../types/gbp-wire.type';
import type {
  ProviderReview,
  ProviderReviewPage,
  ProviderReviewReply,
} from '../types/review-provider.type';
import { starRatingToInt } from '../utils/star-rating.util';

// The full path embeds account and location, so a reconnected account would re-import the same review;
// `reviews` is unique on (location_id, external_review_id), which would not catch it.
function extractReviewId(review: GbpReview): string {
  if (review.reviewId) {
    return review.reviewId;
  }

  const lastSegment = review.name.split('/').pop();

  if (!lastSegment) {
    throw new ProviderMappingError(`Google review has no usable id: ${review.name}`);
  }

  return lastSegment;
}

// `reviewMediaItems` and `reviewReplyUrl` are deliberately dropped: no media feature, and we never link to Google's reply UI.
export function mapGbpReview(review: GbpReview): ProviderReview {
  return {
    externalReviewId: extractReviewId(review),
    // Google exposes only a display name the reviewer can change; synthesizing an id from it would split their history on edit.
    externalReviewerId: null,
    reviewerName: review.reviewer?.displayName ?? null,
    rating: starRatingToInt(review.starRating),
    // null, not "": keeps "left no text" distinguishable from "left an empty string" for the classifier.
    text: review.comment ?? null,
    reviewedAt: review.createTime,
    externalUpdatedAt: review.updateTime,
    reply: mapGbpReviewReply(review.reviewReply),
  };
}

// Only an APPROVED reply is live on Google. The backfill imports replies as status='posted' and the AI imitates
// them as the owner's voice, and the write path's freshness check must treat rejected/pending as "no reply".
// A missing state counts as approved: the field is documented as always populated, so absence means a mock/older payload.
export function mapGbpReviewReply(reply: GbpReviewReply | undefined): ProviderReviewReply | null {
  if (!reply) {
    return null;
  }

  if (reply.reviewReplyState !== undefined && reply.reviewReplyState !== 'APPROVED') {
    return null;
  }

  return { comment: reply.comment, updatedAt: reply.updateTime };
}

export function mapGbpReviewPage(response: GbpListReviewsResponse): ProviderReviewPage {
  return {
    reviews: (response.reviews ?? []).map(mapGbpReview),
    nextPageToken: response.nextPageToken ?? null,
    // `?? null`, never the page length: a per-page count posing as a total makes progress hit 100% on page one.
    totalCount: response.totalReviewCount ?? null,
    averageRating: response.averageRating ?? null,
  };
}
