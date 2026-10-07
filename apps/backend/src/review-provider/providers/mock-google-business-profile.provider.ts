import { Logger } from '@nestjs/common';

import type { GbpProviderConfig } from './google-business-profile.provider';
import { GoogleBusinessProfileProvider } from './google-business-profile.provider';

import { GBP_HOSTS, GOOGLE_OAUTH } from '../constants/review-provider.constants';
import { ProviderMappingError, ProviderNotConfiguredError } from '../errors/provider.error';
import { mockAccountsResponse } from '../fixtures/gbp-accounts.fixture';
import { mockLocationsResponse } from '../fixtures/gbp-locations.fixture';
import { mockReviewsResponse } from '../fixtures/gbp-reviews.fixture';
import type { ProviderTokenSet } from '../types/review-provider.type';

/** Short enough that the near-expiry refresh path in ProviderCredentialService is reachable in a normal dev session. */
const MOCK_TOKEN_TTL_SECONDS = 3600;

export interface MockGbpProviderConfig extends GbpProviderConfig {
  /** Lets ACCOUNT_MISMATCH be produced deliberately. */
  accountIdOverride?: string | undefined;
}

/**
 * Overrides only the HTTP transport (`request()`, token endpoints, revoke), so pagination, URL
 * construction, mappers and error classification still run for real. Does not bypass our own OAuth
 * callback: `buildAuthorizationUrl` bounces back with a synthetic `code` and the real signed
 * `state`, so state verification, nonce, cookie check and the upsert all execute (a second hit
 * gives `INVALID_STATE`; hand-editing gives `ACCESS_DENIED`/`PROVIDER_ERROR`).
 * Only constructed when `DEV_GBP_MOCK=true`, which the Joi schema forbids in production.
 */
export class MockGoogleBusinessProfileProvider extends GoogleBusinessProfileProvider {
  protected override readonly logger = new Logger(MockGoogleBusinessProfileProvider.name);
  private readonly accountIdOverride: string | undefined;

  /** In-memory reply store for when `DEV_GBP_MOCK` is the only mock flag set. Keyed by the bare review id (no `reviews/` prefix). */
  private readonly mockReplies = new Map<string, { comment: string; updateTime: string }>();

  constructor(config: MockGbpProviderConfig) {
    super(config);
    this.accountIdOverride = config.accountIdOverride;
  }

  override buildAuthorizationUrl(state: string): string {
    this.assertConfigured();

    const params = new URLSearchParams({
      code: `mock-auth-code-${Date.now()}`,
      state,
      // Matches what Google appends, and shows in the address bar that this round trip never left the machine.
      mock: '1',
    });

    return `${this.config.callbackUrl}?${params.toString()}`;
  }

  override async refreshAccessToken(_refreshToken: string): Promise<ProviderTokenSet> {
    // Like Google, returns no refresh_token on refresh, so ProviderCredentialService's keep-the-stored-one path is exercised.
    return Promise.resolve(this.mintTokens({ includeRefreshToken: false }));
  }

  override async revoke(_refreshToken: string): Promise<boolean> {
    return Promise.resolve(true);
  }

  /**
   * Routes on the URL the inherited methods built, so a wrong host or path in the real provider
   * surfaces as an unhandled URL. The reply routes are checked before the broader `/reviews`
   * list-page branch, whose substring match would otherwise return a list page for a single review/reply.
   */
  protected override async request<T>(
    url: string,
    accessToken: string,
    init?: { method: 'PUT'; body: string }
  ): Promise<T> {
    if (url.startsWith(`${GBP_HOSTS.ACCOUNT_MANAGEMENT}/accounts`)) {
      return Promise.resolve(mockAccountsResponse(this.accountIdOverride) as T);
    }

    if (url.startsWith(GBP_HOSTS.BUSINESS_INFORMATION) && url.includes('/locations')) {
      return Promise.resolve(mockLocationsResponse() as T);
    }

    const pathname = new URL(url).pathname;
    const replyMatch = /\/reviews\/([^/]+)\/reply$/.exec(pathname);
    const singleReviewMatch = replyMatch ? null : /\/reviews\/([^/]+)$/.exec(pathname);

    if (replyMatch || singleReviewMatch) {
      // With `localMockServerUrl` set the request already targets a real mock HTTP server, so use the real transport. Unset, it would hit the real host; the in-memory store below covers that case.
      if (this.config.localMockServerUrl !== undefined) {
        return super.request<T>(url, accessToken, init);
      }

      const reviewId = (replyMatch ?? singleReviewMatch)?.[1];
      if (reviewId === undefined) {
        throw new ProviderMappingError(`Mock Google Business Profile could not parse: ${url}`);
      }

      if (replyMatch) {
        const body =
          init?.body !== undefined ? (JSON.parse(init.body) as { comment: string }) : null;
        const reply = { comment: body?.comment ?? '', updateTime: new Date().toISOString() };
        this.mockReplies.set(reviewId, reply);
        return Promise.resolve(reply as T);
      }

      return Promise.resolve({ reviewReply: this.mockReplies.get(reviewId) } as T);
    }

    if (url.startsWith(GBP_HOSTS.LEGACY_V4) && url.includes('/reviews')) {
      const pageToken = new URL(url).searchParams.get('pageToken');
      return Promise.resolve(mockReviewsResponse(pageToken ?? undefined) as T);
    }

    // Throws rather than answering "no results": an unrecognized URL is a request this mock was never taught, and would pass as an empty location.
    throw new ProviderMappingError(`Mock Google Business Profile has no fixture for: ${url}`);
  }

  /** The mock needs no client id/secret. Overriding this check, not `exchangeCode`, keeps the account lookup and upsert running for real. */
  protected override assertConfigured(): void {
    if (!this.config.callbackUrl) {
      throw new ProviderNotConfiguredError(
        'GBP_CALLBACK_URL must be set even with DEV_GBP_MOCK=true — the mock redirects the browser back through the real callback route.'
      );
    }
  }

  protected override async postToken(form: Record<string, string>): Promise<ProviderTokenSet> {
    return Promise.resolve(
      this.mintTokens({ includeRefreshToken: form['grant_type'] === 'authorization_code' })
    );
  }

  private mintTokens({ includeRefreshToken }: { includeRefreshToken: boolean }): ProviderTokenSet {
    return {
      accessToken: `mock-access-token-${Date.now()}`,
      ...(includeRefreshToken ? { refreshToken: `mock-refresh-token-${Date.now()}` } : {}),
      scope: GOOGLE_OAUTH.SCOPES.join(' '),
      expiresAt: new Date(Date.now() + MOCK_TOKEN_TTL_SECONDS * 1000),
    };
  }
}
