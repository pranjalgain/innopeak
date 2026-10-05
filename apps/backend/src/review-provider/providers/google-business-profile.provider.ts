import { ReviewProvider as ReviewProviderKey } from '@common/enums/review-provider.enum';
import { Logger } from '@nestjs/common';

import { ReviewProvider } from './review-provider.provider';

import {
  GBP_HOSTS,
  GBP_LOCATION_READ_MASK,
  GBP_REVIEWS_ORDER_BY,
  GBP_REVIEWS_PAGE_SIZE,
  GOOGLE_OAUTH,
} from '../constants/review-provider.constants';
import {
  ProviderAuthError,
  ProviderMappingError,
  ProviderNotConfiguredError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from '../errors/provider.error';
import { mapGbpAccount, mapGbpLocation } from '../mappers/gbp-location.mapper';
import { mapGbpReviewPage, mapGbpReviewReply } from '../mappers/gbp-review.mapper';
import type {
  GbpListAccountsResponse,
  GbpListLocationsResponse,
  GbpListReviewsResponse,
  GbpReview,
  GbpReviewReply,
  GbpTokenResponse,
} from '../types/gbp-wire.type';
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

export interface GbpProviderConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  /**
   * Set (by `review-provider.module.ts`'s factory, via `getLocalMockServerUrl`) when
   * `USE_LOCAL_MOCK_SERVER=true` — redirects `getReviewReply`/`replyToReview` at
   * `apps/mock-external-apis` instead of the real `GBP_HOSTS.LEGACY_V4` host. Deliberately scoped
   * to only these two write-path methods: `listLocations`/`listReviews` already have their own,
   * separate in-process mock (`MockGoogleBusinessProfileProvider`, `DEV_GBP_MOCK`) and are
   * unaffected by this flag either way.
   */
  localMockServerUrl?: string;
}

/** `error.errors[].reason` values Google's docs name as quota-specific — see `isQuotaExceeded403`. */
const QUOTA_EXCEEDED_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'dailyLimitExceeded',
  'quotaExceeded',
]);

/**
 * The real Google Business Profile client. Bare `fetch` — there is no HTTP-client idiom in this
 * codebase to follow (every other outbound call goes through an AWS SDK), and a dependency for
 * six requests would be its own kind of surprise.
 *
 * **This class is also the mock's base class.** `MockGoogleBusinessProfileProvider` overrides only
 * `request()` and the token endpoints, so pagination, both mappers, `starRatingToInt`, and the
 * 401/403-vs-429-vs-5xx classification below are all *inherited* and genuinely exercised under
 * `DEV_GBP_MOCK=true`. That is the point of the split: the parts most likely to be wrong are the
 * parts the mock cannot bypass.
 *
 * `getReviewReply`/`replyToReview` (the write path) are a separate mock story from the rest of
 * this class: rather than another `MockGoogleBusinessProfileProvider`-style subclass, they check
 * `config.localMockServerUrl` (set by the factory when `USE_LOCAL_MOCK_SERVER=true`) and simply
 * point at `apps/mock-external-apis` instead of `GBP_HOSTS.LEGACY_V4` — same request/response
 * handling either way, only the host differs. See `GbpProviderConfig.localMockServerUrl`'s own
 * comment for why this is deliberately independent of `DEV_GBP_MOCK`.
 */
export class GoogleBusinessProfileProvider extends ReviewProvider {
  readonly providerKey = ReviewProviderKey.GOOGLE;
  protected readonly logger = new Logger(GoogleBusinessProfileProvider.name);

  constructor(protected readonly config: GbpProviderConfig) {
    super();
  }

  /**
   * `access_type=offline` + `prompt=consent` is what makes Google return a refresh token at all.
   * Without `prompt=consent`, a returning owner who has already granted this client gets an
   * access token and **no** refresh token — the connection then works for exactly one hour and
   * then flips to `needs_reauth` with no way to recover except revoking the grant in a Google
   * settings page most owners will never find.
   */
  buildAuthorizationUrl(state: string): string {
    this.assertConfigured();

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.callbackUrl,
      response_type: 'code',
      scope: GOOGLE_OAUTH.SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });

    return `${GOOGLE_OAUTH.AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<ProviderConnectionResult> {
    this.assertConfigured();

    const tokens = await this.postToken({
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.callbackUrl,
      grant_type: 'authorization_code',
    });

    const account = await this.fetchPrimaryAccount(tokens.accessToken);
    return { tokens, account };
  }

  async refreshAccessToken(refreshToken: string): Promise<ProviderTokenSet> {
    this.assertConfigured();

    return this.postToken({
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
    });
  }

  async revoke(refreshToken: string): Promise<boolean> {
    try {
      const response = await fetch(GOOGLE_OAUTH.REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      });
      return response.ok;
    } catch (error) {
      // Swallowed on purpose: an unrevoked upstream grant is a worse outcome than a tenant that
      // cannot disconnect at all, so the caller records `credentialRevoked: false` and carries on.
      this.logger.warn(`Failed to revoke Google credential: ${(error as Error).message}`);
      return false;
    }
  }

  async listLocations(accessToken: string, externalAccountId: string): Promise<ProviderLocation[]> {
    const locations: ProviderLocation[] = [];
    let pageToken: string | undefined;

    // Paginate to exhaustion rather than returning page one: a franchise with 60 locations would
    // otherwise be shown a confirm-location picker that silently omits the store they wanted.
    do {
      const params = new URLSearchParams({ readMask: GBP_LOCATION_READ_MASK, pageSize: '100' });
      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const response = await this.request<GbpListLocationsResponse>(
        `${GBP_HOSTS.BUSINESS_INFORMATION}/${externalAccountId}/locations?${params.toString()}`,
        accessToken
      );

      locations.push(...(response.locations ?? []).map(mapGbpLocation));
      pageToken = response.nextPageToken;
    } while (pageToken);

    return locations;
  }

  async listReviews(accessToken: string, options: ListReviewsOptions): Promise<ProviderReviewPage> {
    const params = new URLSearchParams({
      pageSize: String(options.pageSize ?? GBP_REVIEWS_PAGE_SIZE),
      // Newest first. The backfill stops once it has ~50 owner replies for the AI to imitate
      // (PLAN.md §7), and without an explicit order that cap collects fifty *arbitrary* replies
      // from whatever Google returns first — not the owner's current voice.
      orderBy: GBP_REVIEWS_ORDER_BY,
    });
    if (options.pageToken) {
      params.set('pageToken', options.pageToken);
    }

    // Note the host: reviews are on the legacy v4 API, not the Business Information one used
    // above. See GBP_HOSTS.
    const response = await this.request<GbpListReviewsResponse>(
      `${GBP_HOSTS.LEGACY_V4}/${options.externalAccountId}/${options.externalLocationId}/reviews?${params.toString()}`,
      accessToken
    );

    return mapGbpReviewPage(response);
  }

  /**
   * The freshness check PLAN.md §8.12 requires immediately before posting. `GET
   * .../reviews/{reviewId}` returns the single `Review` resource directly (not a list page), so
   * this reads `reviewReply` straight off it via the same `mapGbpReviewReply` the list mapper
   * uses — a rejected/pending reply must read identically to "no reply" here too, for the same
   * reason it does on the read side.
   */
  async getReviewReply(
    accessToken: string,
    input: GetReviewReplyInput
  ): Promise<ProviderReviewReply | null> {
    const response = await this.request<GbpReview>(
      `${this.legacyV4Base()}/${input.externalAccountId}/${input.externalLocationId}/reviews/${input.externalReviewId}`,
      accessToken
    );

    return mapGbpReviewReply(response.reviewReply);
  }

  /**
   * `PUT .../reviews/{reviewId}/reply` — an unconditional upsert, per this method's own doc
   * comment on the abstract class. Google returns the `ReviewReply` resource directly (the same
   * shape `getReviewReply` reads off the parent review), not wrapped in anything.
   */
  async replyToReview(
    accessToken: string,
    input: ReplyToReviewInput
  ): Promise<ProviderReviewReply> {
    const response = await this.request<GbpReviewReply>(
      `${this.legacyV4Base()}/${input.externalAccountId}/${input.externalLocationId}/reviews/${input.externalReviewId}/reply`,
      accessToken,
      { method: 'PUT', body: JSON.stringify({ comment: input.comment }) }
    );

    const mapped = mapGbpReviewReply(response);
    if (mapped === null) {
      // Only reachable if Google's own moderation rejected the reply we just submitted — still a
      // real response, not a transport failure, so this is a mapping problem (the caller asked to
      // post something that didn't end up live), not a retryable one.
      throw new ProviderMappingError(
        `Google did not return a live reply after posting (state: ${response.reviewReplyState ?? 'unknown'})`
      );
    }
    return mapped;
  }

  /** The real `GBP_HOSTS.LEGACY_V4` host, or — when `localMockServerUrl` is set —
   *  `apps/mock-external-apis`'s equivalent `/v4` path, so `getReviewReply`/`replyToReview`'s own
   *  URL construction is identical either way; only the base differs. */
  private legacyV4Base(): string {
    return this.config.localMockServerUrl !== undefined
      ? `${this.config.localMockServerUrl}/v4`
      : GBP_HOSTS.LEGACY_V4;
  }

  /**
   * The single outbound-HTTP seam. `protected` because overriding exactly this method — and
   * nothing else — is what makes the mock a mock rather than a reimplementation.
   */
  protected async request<T>(
    url: string,
    accessToken: string,
    init?: { method: 'PUT'; body: string }
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(url, {
        method: init?.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...(init ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(init ? { body: init.body } : {}),
      });
    } catch (error) {
      // A transport failure never reached Google, so it is by definition retryable — mapping it
      // to an auth error would send the owner through a re-consent that fixes nothing.
      throw new ProviderUnavailableError(
        `Google Business Profile request failed: ${(error as Error).message}`,
        error
      );
    }

    if (!response.ok) {
      throw this.classifyHttpError(
        response.status,
        await this.safeText(response),
        response.headers.get('retry-after')
      );
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new ProviderMappingError('Google Business Profile returned a non-JSON body', error);
    }
  }

  /**
   * 401/403 vs. 429 vs. 5xx, and the distinction drives real product behaviour: only the first
   * group flips the connection to `needs_reauth` and asks the owner to re-consent.
   *
   * 403 is grouped with 401 by default despite also being one of Google's quota-exceeded
   * statuses — this Discovery-based API puts some quota errors behind 403, not just 429. A
   * genuinely quota-limited 403 misread as auth costs a pointless reconnect prompt, so
   * `isQuotaExceeded403` first checks the body for a `reason` Google's own docs name as
   * quota-specific (`errors[].reason`) and, only then, reclassifies as rate-limited instead.
   * An unrecognized or unparseable body falls through to the safe default below: a misread 401
   * leaves a dead grant retrying on a timer forever with the owner never told anything is wrong,
   * which is worse than an occasional unnecessary reconnect prompt.
   */
  protected classifyHttpError(status: number, body: string, retryAfter?: string | null): Error {
    const detail = body.slice(0, 500);

    if (status === 403 && this.isQuotaExceeded403(body)) {
      return new ProviderRateLimitError(`Google quota exceeded (403): ${detail}`, null);
    }

    if (status === 401 || status === 403) {
      return new ProviderAuthError(`Google rejected the credential (${status}): ${detail}`);
    }

    if (status === 429) {
      // Retry-After is delta-seconds here; a date form is possible in HTTP generally but Google
      // sends seconds, and anything unparseable falls back to the caller's default wait.
      const seconds = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;
      return new ProviderRateLimitError(
        `Google rate limit hit (${status}): ${detail}`,
        Number.isFinite(seconds) && seconds > 0 ? seconds : null
      );
    }

    if (status >= 500) {
      return new ProviderUnavailableError(`Google returned ${status}: ${detail}`);
    }

    // A 4xx that is not auth and not rate limiting means we asked for something wrong — a bad
    // readMask, an unknown location. Retrying reproduces it exactly, so it is not retryable.
    return new ProviderMappingError(`Google rejected the request (${status}): ${detail}`);
  }

  /**
   * Discovery-based Google APIs (which GBP's is) carry the specific failure reason in
   * `error.errors[].reason`, not in the top-level `status`/`code` — those stay `403` either way.
   * Scoped to reasons Google documents as quota-specific; anything else (`forbidden`,
   * `insufficientPermissions`, or a body that fails to parse) returns `false` and `classifyHttpError`
   * keeps its safe default of treating the 403 as an auth failure.
   */
  private isQuotaExceeded403(body: string): boolean {
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed !== 'object' || parsed === null) {
        return false;
      }

      const error = (parsed as { error?: unknown }).error;
      if (typeof error !== 'object' || error === null) {
        return false;
      }

      const errors = (error as { errors?: unknown }).errors;
      if (!Array.isArray(errors)) {
        return false;
      }

      return errors.some(
        entry =>
          typeof entry === 'object' &&
          entry !== null &&
          QUOTA_EXCEEDED_REASONS.has((entry as { reason?: unknown }).reason as string)
      );
    } catch {
      return false;
    }
  }

  /**
   * `classifyHttpError` cannot see this: RFC 6749 §5.2 puts a revoked/expired/reused refresh
   * token behind HTTP **400** with `{ "error": "invalid_grant" }`, not 401/403 — Google's own
   * error-response convention for the token endpoint is unrelated to its convention for every
   * other API call this client makes. Left to the generic classifier, 400 falls into "a 4xx that
   * is not auth and not rate limiting" and comes back as `ProviderMappingError`, which
   * `callProvider` (the caller two layers up) treats as a transient 502 rather than
   * `needs_reauth` — so an owner who revoked access in their Google account sees "Google is
   * unavailable, try again" forever, on a connection that can never recover without reconnecting.
   *
   * Scoped to `invalid_grant` only. `invalid_client`/`unauthorized_client` mean *this server's*
   * OAuth client id/secret is wrong — every tenant's refresh would fail identically, and asking
   * one owner to reconnect cannot fix a broken client credential. Conflating the two would trade
   * one misclassification for another.
   */
  private classifyTokenError(status: number, body: string): Error {
    if (status === 400) {
      const code = this.parseOAuthErrorCode(body);
      if (code === 'invalid_grant') {
        return new ProviderAuthError(
          `Google rejected the refresh token (invalid_grant): ${body.slice(0, 500)}`
        );
      }
    }

    return this.classifyHttpError(status, body);
  }

  private parseOAuthErrorCode(body: string): string | null {
    try {
      const parsed: unknown = JSON.parse(body);
      const code =
        typeof parsed === 'object' && parsed !== null
          ? (parsed as { error?: unknown }).error
          : undefined;
      return typeof code === 'string' ? code : null;
    } catch {
      return null;
    }
  }

  protected async postToken(form: Record<string, string>): Promise<ProviderTokenSet> {
    let response: Response;

    try {
      response = await fetch(GOOGLE_OAUTH.TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
      });
    } catch (error) {
      throw new ProviderUnavailableError(
        `Google token endpoint unreachable: ${(error as Error).message}`,
        error
      );
    }

    if (!response.ok) {
      const text = await this.safeText(response);
      throw this.classifyTokenError(response.status, text);
    }

    const body = (await response.json()) as GbpTokenResponse;

    return {
      accessToken: body.access_token,
      // Only spread when present. Google omits `refresh_token` on every refresh, and under
      // `exactOptionalPropertyTypes` writing `refreshToken: undefined` is a type error rather
      // than a silent overwrite — which is the outcome we want, since overwriting a stored
      // refresh token with undefined is how a working connection dies an hour later.
      ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}),
      ...(body.scope ? { scope: body.scope } : {}),
      expiresAt: new Date(Date.now() + body.expires_in * 1000),
    };
  }

  protected async fetchPrimaryAccount(
    accessToken: string
  ): Promise<ProviderConnectionResult['account']> {
    const response = await this.request<GbpListAccountsResponse>(
      `${GBP_HOSTS.ACCOUNT_MANAGEMENT}/accounts`,
      accessToken
    );

    const account = response.accounts?.[0];

    if (!account) {
      // The grant succeeded but authorizes no Business Profile account — common when someone
      // consents with a personal Google account that has never claimed a business.
      throw new ProviderMappingError(
        'The Google account that granted access manages no Business Profile accounts'
      );
    }

    return mapGbpAccount(account);
  }

  /**
   * Throws only when a route actually needs Google, not at boot. A developer working on an
   * unrelated feature has no GBP credentials, and hard-failing startup for them would be hostile;
   * the connections routes translate this into a 503 instead.
   */
  protected assertConfigured(): void {
    if (!this.config.clientId || !this.config.clientSecret || !this.config.callbackUrl) {
      throw new ProviderNotConfiguredError(
        'GBP_CLIENT_ID, GBP_CLIENT_SECRET and GBP_CALLBACK_URL must be set to use Google Business Profile'
      );
    }
  }

  private async safeText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '<unreadable body>';
    }
  }
}
