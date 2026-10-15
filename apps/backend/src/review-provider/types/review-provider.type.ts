export interface ProviderTokenSet {
  accessToken: string;
  /** Only on first consent; Google omits it on refresh, so the store must keep the original (see ProviderCredentialService). */
  refreshToken?: string;
  /** Absolute expiry, already resolved from the provider's relative `expires_in`. */
  expiresAt: Date;
  scope?: string;
}

export interface ProviderAccount {
  /** Stored as `review_provider_connections.provider_account_id`. */
  externalAccountId: string;
  name?: string;
  /** Google's `AccountType` (`PERSONAL`, `LOCATION_GROUP`, `USER_GROUP`, `ORGANIZATION`); shown to the owner when choosing between accounts. */
  type?: string;
}

export interface ProviderLocation {
  externalLocationId: string;
  name: string;
  address: string | null;
  /** The primary phone number the business lists, as Google formats it. */
  phone: string | null;
  websiteUri: string | null;
  /** The business's primary category as Google names it ("Restaurant"); `null` when it lists none. */
  category: string | null;
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
  /** 1-5, never 0: `reviews_rating_check` rejects it, so the mapper throws. */
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
  /** Not defaulted to `reviews.length`: a fabricated denominator makes the progress bar hit 100% on page one. */
  totalCount: number | null;
  /** Google's overall rating across every review of the location (not just this page); `null` when it did not send one, as on later pages. */
  averageRating: number | null;
}

export interface ProviderConnectionResult {
  tokens: ProviderTokenSet;
  /** Every account the grant can manage, at least one; the caller chooses when there are several. */
  accounts: ProviderAccount[];
}

export interface ListReviewsOptions {
  externalLocationId: string;
  /** Google's review path needs both the account and the location. */
  externalAccountId: string;
  pageToken?: string | undefined;
  pageSize?: number | undefined;
}

/** The account/location/review triple addressing one GBP review. */
export interface GetReviewReplyInput {
  externalAccountId: string;
  externalLocationId: string;
  externalReviewId: string;
}

export interface ReplyToReviewInput extends GetReviewReplyInput {
  comment: string;
}
