import { ReviewProvider as ReviewProviderKey } from '@common/enums/review-provider.enum';
import { Logger } from '@nestjs/common';

import { ReviewProvider } from './review-provider.provider';

import {
  GBP_ACCOUNTS_PAGE_SIZE,
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
  ProviderAccount,
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
}

/** `error.errors[].reason` values Google's docs name as quota-specific. */
const QUOTA_EXCEEDED_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'dailyLimitExceeded',
  'quotaExceeded',
]);

/** Bare `fetch`: a dependency for six requests isn't worth it. Always talks to Google; there is no stand-in. */
export class GoogleBusinessProfileProvider extends ReviewProvider {
  readonly providerKey = ReviewProviderKey.GOOGLE;
  protected readonly logger = new Logger(GoogleBusinessProfileProvider.name);

  constructor(protected readonly config: GbpProviderConfig) {
    super();
  }

  /** `prompt=consent` is required for a refresh token: without it a returning owner gets none, and the connection dies after an hour. */
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

    const accounts = await this.fetchAccounts(tokens.accessToken);
    return { tokens, accounts };
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
      if (response.ok) {
        return true;
      }
      // 400 invalid_token means already revoked or expired: the goal state, not a failure.
      if (response.status === 400) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        return body?.error === 'invalid_token';
      }
      return false;
    } catch (error) {
      // Swallowed on purpose: a tenant that cannot disconnect is worse than an unrevoked grant; the caller records `credentialRevoked: false`.
      this.logger.warn(`Failed to revoke Google credential: ${(error as Error).message}`);
      return false;
    }
  }

  async listLocations(accessToken: string, externalAccountId: string): Promise<ProviderLocation[]> {
    const locations: ProviderLocation[] = [];
    let pageToken: string | undefined;

    // Paginate to exhaustion: page one alone would silently omit stores for a large franchise.
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
      // Newest first: the backfill stops at ~50 owner replies, which must be the owner's current voice, not arbitrary ones.
      orderBy: GBP_REVIEWS_ORDER_BY,
    });
    if (options.pageToken) {
      params.set('pageToken', options.pageToken);
    }

    // Reviews live on the legacy v4 host, not the Business Information one above.
    const response = await this.request<GbpListReviewsResponse>(
      `${GBP_HOSTS.LEGACY_V4}/${options.externalAccountId}/${options.externalLocationId}/reviews?${params.toString()}`,
      accessToken
    );

    return mapGbpReviewPage(response);
  }

  /** Freshness check before posting. A rejected/pending reply must read as "no reply", same as in the list mapper. */
  async getReviewReply(
    accessToken: string,
    input: GetReviewReplyInput
  ): Promise<ProviderReviewReply | null> {
    const response = await this.request<GbpReview>(
      `${GBP_HOSTS.LEGACY_V4}/${input.externalAccountId}/${input.externalLocationId}/reviews/${input.externalReviewId}`,
      accessToken
    );

    return mapGbpReviewReply(response.reviewReply);
  }

  /** Unconditional upsert; Google returns the `ReviewReply` resource unwrapped. */
  async replyToReview(
    accessToken: string,
    input: ReplyToReviewInput
  ): Promise<ProviderReviewReply> {
    const response = await this.request<GbpReviewReply>(
      `${GBP_HOSTS.LEGACY_V4}/${input.externalAccountId}/${input.externalLocationId}/reviews/${input.externalReviewId}/reply`,
      accessToken,
      { method: 'PUT', body: JSON.stringify({ comment: input.comment }) }
    );

    const mapped = mapGbpReviewReply(response);
    if (mapped === null) {
      // Only when Google's moderation rejected the reply: a real response, so a mapping problem, not retryable.
      throw new ProviderMappingError(
        `Google did not return a live reply after posting (state: ${response.reviewReplyState ?? 'unknown'})`
      );
    }
    return mapped;
  }

  /** The single outbound-HTTP seam. */
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
      // Never reached Google, so retryable; an auth error would send the owner through a pointless re-consent.
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
   * Only 401/403 flips the connection to `needs_reauth`. A 403 is reclassified as rate-limited only
   * when the body names a quota reason; an unrecognized body stays auth, since a dead grant retrying
   * forever unnoticed is worse than an occasional needless reconnect prompt.
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
      // Delta-seconds only (Google doesn't send the HTTP-date form); unparseable falls back to the caller's default wait.
      const seconds = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;
      return new ProviderRateLimitError(
        `Google rate limit hit (${status}): ${detail}`,
        Number.isFinite(seconds) && seconds > 0 ? seconds : null
      );
    }

    if (status >= 500) {
      return new ProviderUnavailableError(`Google returned ${status}: ${detail}`);
    }

    // Any other 4xx means we asked for something wrong (bad readMask, unknown location); retrying reproduces it.
    return new ProviderMappingError(`Google rejected the request (${status}): ${detail}`);
  }

  /** Discovery-based Google APIs carry the reason in `error.errors[].reason`; top-level `status`/`code` stay 403 either way. Anything unrecognized or unparseable returns false. */
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
   * The token endpoint answers a revoked/expired refresh token with HTTP 400 `invalid_grant` (RFC
   * 6749 §5.2), not 401/403, so the generic classifier would call it a retryable 502 and the owner
   * would never be asked to reconnect. `invalid_client`/`unauthorized_client` are deliberately not
   * mapped: they mean this server's client credentials are wrong, which reconnecting cannot fix.
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
      // Only spread when present: Google omits `refresh_token` on refresh, and overwriting the stored one with undefined kills the connection an hour later.
      ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}),
      ...(body.scope ? { scope: body.scope } : {}),
      expiresAt: new Date(Date.now() + body.expires_in * 1000),
    };
  }

  /** Every account the grant manages; Google pages this list (20 at a time), so follow `nextPageToken` to the end. */
  protected async fetchAccounts(accessToken: string): Promise<ProviderAccount[]> {
    const accounts: ProviderAccount[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({ pageSize: String(GBP_ACCOUNTS_PAGE_SIZE) });
      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const response = await this.request<GbpListAccountsResponse>(
        `${GBP_HOSTS.ACCOUNT_MANAGEMENT}/accounts?${params.toString()}`,
        accessToken
      );

      for (const account of response.accounts ?? []) {
        accounts.push(mapGbpAccount(account));
      }
      pageToken = response.nextPageToken === '' ? undefined : response.nextPageToken;
    } while (pageToken);

    if (accounts.length === 0) {
      // Common when consenting with a personal Google account that never claimed a business.
      throw new ProviderMappingError(
        'The Google account that granted access manages no Business Profile accounts'
      );
    }

    return accounts;
  }

  /** Throws on use, not at boot, so developers without GBP credentials can still start the app; connections routes translate it to a 503. */
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
