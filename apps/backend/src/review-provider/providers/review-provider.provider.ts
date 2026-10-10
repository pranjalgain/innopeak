// Aliased: the enum and this abstract class deliberately share the domain name.
import type { ReviewProvider as ReviewProviderKey } from '@common/enums/review-provider.enum';

import type {
  GetReviewReplyInput,
  ListReviewsOptions,
  ProviderConnectionResult,
  ProviderLocation,
  ProviderReviewPage,
  ProviderReviewReply,
  ProviderTokenSet,
  ReplyToReviewInput,
} from '../types/review-provider.type';

/**
 * The DI token is this class (no `@Injectable()`); concretes come from a `useFactory` so nothing
 * branches on environment. Lives outside `src/api/connections/` because the worker process, which
 * never imports API modules, needs this client too.
 */
export abstract class ReviewProvider {
  abstract readonly providerKey: ReviewProviderKey;

  /** `state` is minted by the caller and passed through untouched: a provider-generated nonce would be out of reach of the server-side record that consumes it. */
  abstract buildAuthorizationUrl(state: string): string;

  abstract exchangeCode(code: string): Promise<ProviderConnectionResult>;

  /** Google omits `refresh_token` on refresh, so the result's may be absent — keep the old one. */
  abstract refreshAccessToken(refreshToken: string): Promise<ProviderTokenSet>;

  /** Best-effort: a refusal to revoke must not block disconnecting, so callers log it. Returns whether it worked. */
  abstract revoke(refreshToken: string): Promise<boolean>;

  abstract listLocations(
    accessToken: string,
    externalAccountId: string
  ): Promise<ProviderLocation[]>;

  /** One location's current details, so name, address, phone and website can be kept up to date. */
  abstract getLocation(accessToken: string, externalLocationId: string): Promise<ProviderLocation>;

  abstract listReviews(
    accessToken: string,
    options: ListReviewsOptions
  ): Promise<ProviderReviewPage>;

  /**
   * Freshness check before posting, read from the provider, never our last-polled copy. `null` means
   * no reply yet; a differing `comment` means someone replied elsewhere (or raced) and the caller must abort.
   */
  abstract getReviewReply(
    accessToken: string,
    input: GetReviewReplyInput
  ): Promise<ProviderReviewReply | null>;

  /** Google's reply endpoint is an unconditional upsert: callers must run `getReviewReply` just before, or risk overwriting a reply written directly on Google. */
  abstract replyToReview(
    accessToken: string,
    input: ReplyToReviewInput
  ): Promise<ProviderReviewReply>;
}
