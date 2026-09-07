/**
 * Google's *wire* shapes, exactly as the Business Profile APIs return them — not our row shapes.
 *
 * These are kept verbatim (including `starRating` as an English word rather than a number, and
 * `name` as a slash-delimited resource path rather than a bare id) because the fixtures behind
 * `DEV_GBP_MOCK` are typed against them. A fixture written in row shape would test the mapper
 * against itself; a fixture written in wire shape makes the mapper prove it can survive the
 * things Google actually sends.
 *
 * Two different hosts are involved, which is a real trap — see `GBP_HOSTS`.
 */

/** `starRating` is an enum word. `STAR_RATING_UNSPECIFIED` is Google's "we don't know", not zero. */
export type GbpStarRating = 'FIVE' | 'FOUR' | 'ONE' | 'STAR_RATING_UNSPECIFIED' | 'THREE' | 'TWO';

export interface GbpReviewer {
  /** Absent for an anonymous reviewer — the mapper must not assume it. */
  displayName?: string;
  profilePhotoUrl?: string;
  isAnonymous?: boolean;
}

/**
 * Output-only moderation status. Only `APPROVED` is visible to the public — a `REJECTED` reply
 * violated a content policy and a `PENDING` one may still be. Neither is "posted".
 */
export type GbpReviewReplyState = 'APPROVED' | 'PENDING' | 'REJECTED';

export interface GbpReviewReply {
  comment: string;
  updateTime: string;
  reviewReplyState?: GbpReviewReplyState;
}

export interface GbpReview {
  /** `accounts/{account}/locations/{location}/reviews/{review}` — the review id is the last segment. */
  name: string;
  reviewId?: string;
  reviewer?: GbpReviewer;
  starRating: GbpStarRating;
  /** Absent on a rating-only review. Google omits the key entirely rather than sending "". */
  comment?: string;
  createTime: string;
  updateTime: string;
  /** The business owner's own public reply, if they left one. This is what the backfill imports. */
  reviewReply?: GbpReviewReply;
}

export interface GbpListReviewsResponse {
  reviews?: GbpReview[];
  nextPageToken?: string;
  /** Total across all pages, not just this one — the progress bar's denominator. */
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
