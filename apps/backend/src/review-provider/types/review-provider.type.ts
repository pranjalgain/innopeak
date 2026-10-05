/**
 * The normalized shapes every consumer of a review provider works in — the boundary at which
 * "Google's way of saying it" stops and "our way of saying it" starts. A second provider (Yelp,
 * Trustpilot) adds a mapper, not a new set of types here.
 */

export interface ProviderTokenSet {
  accessToken: string;
  /**
   * Only present on a first consent. Google omits it on every refresh, so the credential store
   * must keep the original rather than overwriting with `undefined` — see ProviderCredentialService.
   */
  refreshToken?: string;
  /** Absolute expiry, already resolved from the provider's relative `expires_in`. */
  expiresAt: Date;
  scope?: string;
}

export interface ProviderAccount {
  /** The provider's own account identifier — stored as `review_provider_connections.provider_account_id`. */
  externalAccountId: string;
  name?: string;
}

export interface ProviderLocation {
  externalLocationId: string;
  name: string;
  address: string | null;
}

export interface ProviderReviewReply {
  comment: string;
  /** ISO string. May legitimately predate the review's own `reviewedAt` in provider data. */
  updatedAt: string;
}

export interface ProviderReview {
  externalReviewId: string;
  externalReviewerId: string | null;
  reviewerName: string | null;
  /** 1–5. Never 0 — `reviews_rating_check` would reject it, so the mapper throws instead. */
  rating: number;
  text: string | null;
  reviewedAt: string;
  externalUpdatedAt: string;
  reply: ProviderReviewReply | null;
}

export interface ProviderReviewPage {
  reviews: ProviderReview[];
  /** `null` when this was the last page. */
  nextPageToken: string | null;
  /**
   * Total across all pages when the provider reports one, else `null`. Deliberately not
   * defaulted to `reviews.length` — a fabricated denominator produces a progress bar that
   * reaches 100% on page one and then keeps going.
   */
  totalCount: number | null;
}

/** What the OAuth callback needs before it can write a connection row. */
export interface ProviderConnectionResult {
  tokens: ProviderTokenSet;
  account: ProviderAccount;
}

export interface ListReviewsOptions {
  externalLocationId: string;
  /** The provider account the location hangs off — Google's review path needs both. */
  externalAccountId: string;
  pageToken?: string | undefined;
  pageSize?: number | undefined;
}

/** What `getReviewReply`/`replyToReview` both need to address one specific review — the same
 *  account/location/review triple that identifies a single GBP review resource. */
export interface GetReviewReplyInput {
  externalAccountId: string;
  externalLocationId: string;
  externalReviewId: string;
}

export interface ReplyToReviewInput extends GetReviewReplyInput {
  comment: string;
}
