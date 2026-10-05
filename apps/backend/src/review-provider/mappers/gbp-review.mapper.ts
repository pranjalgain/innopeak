import { ProviderMappingError } from '../errors/provider.error';
import type { GbpListReviewsResponse, GbpReview, GbpReviewReply } from '../types/gbp-wire.type';
import type {
  ProviderReview,
  ProviderReviewPage,
  ProviderReviewReply,
} from '../types/review-provider.type';
import { starRatingToInt } from '../utils/star-rating.util';

/**
 * `accounts/{a}/locations/{l}/reviews/{reviewId}` -> `reviewId`.
 *
 * The full path is not used as the external id because it embeds the account and location, so the
 * same review re-fetched through a reconnected account would look like a different review and be
 * imported twice — `reviews` is unique on `(location_id, external_review_id)`, which would not
 * catch it.
 */
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

/**
 * `review.reviewMediaItems` and `review.reviewReplyUrl` are real fields Google sends but are
 * deliberately absent from `ProviderReview` below — this product has no review-media feature and
 * never links out to Google's own reply UI, so both are discarded here rather than carried any
 * further. See their doc comments on `GbpReview` for why they are typed at all instead of simply
 * left off the wire type.
 */
export function mapGbpReview(review: GbpReview): ProviderReview {
  return {
    externalReviewId: extractReviewId(review),
    // Google gives no stable reviewer id on this API — only a display name that the reviewer can
    // change at will. Recording null is honest; synthesizing one from the name would silently
    // split one reviewer's history the first time they edit it.
    externalReviewerId: null,
    reviewerName: review.reviewer?.displayName ?? null,
    rating: starRatingToInt(review.starRating),
    // A rating-only review has no `comment` key at all. Normalizing to null (not "") keeps
    // "left no text" distinguishable from "left an empty string" downstream, where the classifier
    // has to decide whether there is anything to read.
    text: review.comment ?? null,
    reviewedAt: review.createTime,
    externalUpdatedAt: review.updateTime,
    reply: mapGbpReviewReply(review.reviewReply),
  };
}

/**
 * Only an APPROVED reply is live on Google. The backfill imports replies as `status = 'posted'`
 * and the AI later imitates them as the owner's voice — so importing a reply Google rejected for a
 * policy violation would both misstate what is public and teach the model a bad example. Reused by
 * `GoogleBusinessProfileProvider.getReviewReply`/`replyToReview` (the write path's freshness check
 * and its own post response) for the identical reason — a rejected/pending reply must read the
 * same as "no reply" to the freshness check, or a post could be wrongly aborted (or wrongly allowed
 * to overwrite) based on a reply that was never actually public.
 *
 * A missing state is treated as approved: the field is output-only and documented as always
 * populated, so its absence means a fixture/mock payload or an older payload, not a moderation
 * outcome.
 */
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
    // `?? null`, never `?? reviews.length`: a per-page count masquerading as a total produces a
    // progress bar that hits 100% on page one and then keeps counting.
    totalCount: response.totalReviewCount ?? null,
  };
}
