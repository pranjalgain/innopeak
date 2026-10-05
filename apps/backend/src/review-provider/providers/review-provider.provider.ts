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
 * The DI token *is* this class — no `@Injectable()`, matching `EmailProvider` and
 * `VerifyEmailTokenProvider`. Concretes are constructed in a `useFactory` so nothing downstream
 * ever branches on environment to decide which one it has.
 *
 * Lives in `src/review-provider/` rather than inside `src/api/connections/` on purpose: the
 * backfill job runs in the **worker** process, which never imports API modules, and the future
 * poller and reply-posting stages need this same client. `src/email/` is the existing precedent
 * for a `@Global()` provider both processes consume.
 */
export abstract class ReviewProvider {
  /** Matches the `review_provider` DB enum, and is what gets written to the row. */
  abstract readonly providerKey: ReviewProviderKey;

  /**
   * The URL to send the owner's browser to for consent. `state` is minted by the caller
   * (OAuthStateService) and passed through untouched — a provider that generated its own would
   * put the nonce out of reach of the server-side record that has to consume it.
   */
  abstract buildAuthorizationUrl(state: string): string;

  /** Exchanges the callback's `code`, and resolves which provider account consented. */
  abstract exchangeCode(code: string): Promise<ProviderConnectionResult>;

  /** Google omits `refresh_token` on refresh, so the result's may be absent — keep the old one. */
  abstract refreshAccessToken(refreshToken: string): Promise<ProviderTokenSet>;

  /**
   * Best-effort: a provider that refuses to revoke must not leave the tenant unable to
   * disconnect, so callers log the failure rather than surfacing it. Returns whether it worked.
   */
  abstract revoke(refreshToken: string): Promise<boolean>;

  /** Live call — nothing is persisted until the owner confirms one of these. */
  abstract listLocations(
    accessToken: string,
    externalAccountId: string
  ): Promise<ProviderLocation[]>;

  abstract listReviews(
    accessToken: string,
    options: ListReviewsOptions
  ): Promise<ProviderReviewPage>;

  /**
   * The freshness check PLAN.md §8.12 requires immediately before posting a reply — reads this
   * one review's current reply state fresh from the provider, never from our own last-polled
   * copy. `null` means no reply exists yet; a non-null result whose `comment` differs from what
   * we're about to post means someone replied another way (directly on Google, or a race with
   * another worker) and the caller must abort rather than overwrite it.
   */
  abstract getReviewReply(
    accessToken: string,
    input: GetReviewReplyInput
  ): Promise<ProviderReviewReply | null>;

  /**
   * The actual post. Google's reply endpoint is an unconditional upsert with no "already exists"
   * check of its own — callers must have just run `getReviewReply` immediately before this to
   * avoid silently overwriting a reply the owner wrote directly on Google (PLAN.md §8.12).
   */
  abstract replyToReview(
    accessToken: string,
    input: ReplyToReviewInput
  ): Promise<ProviderReviewReply>;
}
