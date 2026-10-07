/**
 * Google's wire shapes verbatim (`starRating` as a word, `name` as a resource path): DEV_GBP_MOCK
 * fixtures are typed against them, so the mapper is tested against what Google actually sends.
 * Two different hosts are involved; see `GBP_HOSTS`.
 */

/** `starRating` is an enum word. `STAR_RATING_UNSPECIFIED` is Google's "we don't know", not zero. */
export type GbpStarRating = 'FIVE' | 'FOUR' | 'ONE' | 'STAR_RATING_UNSPECIFIED' | 'THREE' | 'TWO';

export interface GbpReviewer {
  /** Absent for an anonymous reviewer. */
  displayName?: string;
  profilePhotoUrl?: string;
  isAnonymous?: boolean;
}

/** Output-only. Only `APPROVED` is publicly visible; `REJECTED` and `PENDING` are not "posted". */
export type GbpReviewReplyState = 'APPROVED' | 'PENDING' | 'REJECTED';

export interface GbpReviewReply {
  comment: string;
  updateTime: string;
  reviewReplyState?: GbpReviewReplyState;
}

export interface GbpReview {
  /** `accounts/{account}/locations/{location}/reviews/{review}`; the review id is the last segment. */
  name: string;
  reviewId?: string;
  reviewer?: GbpReviewer;
  starRating: GbpStarRating;
  /** Google omits the key entirely on a rating-only review, rather than sending "". */
  comment?: string;
  createTime: string;
  updateTime: string;
  /** The owner's own public reply; what the backfill imports. */
  reviewReply?: GbpReviewReply;
  /** Typed `unknown[]` and never read: this product has no review-media feature; `mapGbpReview` deliberately drops it. */
  reviewMediaItems?: unknown[];
  /** Unused: replies go through our own flow, not Google's reply UI. Dropped by `mapGbpReview`. */
  reviewReplyUrl?: string;
}

export interface GbpListReviewsResponse {
  reviews?: GbpReview[];
  nextPageToken?: string;
  /** Total across all pages: the progress bar's denominator. */
  totalReviewCount?: number;
  averageRating?: number;
}

export interface GbpPostalAddress {
  regionCode?: string;
  languageCode?: string;
  postalCode?: string;
  administrativeArea?: string;
  locality?: string;
  addressLines?: string[];
}

export interface GbpLocation {
  /** `locations/{location_id}`. */
  name: string;
  title?: string;
  storefrontAddress?: GbpPostalAddress;
  websiteUri?: string;
}

export interface GbpListLocationsResponse {
  locations?: GbpLocation[];
  nextPageToken?: string;
  totalSize?: number;
}

export interface GbpAccount {
  /** `accounts/{account_id}`. */
  name: string;
  accountName?: string;
  type?: string;
}

export interface GbpListAccountsResponse {
  accounts?: GbpAccount[];
  nextPageToken?: string;
}

/** OAuth 2.0 token endpoint response. `refresh_token` only appears on the first consent. */
export interface GbpTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}
