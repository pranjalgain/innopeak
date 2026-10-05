import { Logger } from '@nestjs/common';

import type { GbpProviderConfig } from './google-business-profile.provider';
import { GoogleBusinessProfileProvider } from './google-business-profile.provider';

import { GBP_HOSTS, GOOGLE_OAUTH } from '../constants/review-provider.constants';
import { ProviderMappingError, ProviderNotConfiguredError } from '../errors/provider.error';
import { mockAccountsResponse } from '../fixtures/gbp-accounts.fixture';
import { mockLocationsResponse } from '../fixtures/gbp-locations.fixture';
import { mockReviewsResponse } from '../fixtures/gbp-reviews.fixture';
import type { ProviderTokenSet } from '../types/review-provider.type';

/** How long a fabricated access token "lasts". Short enough that the near-expiry refresh path in
 * ProviderCredentialService is reachable in a normal dev session rather than only in theory. */
const MOCK_TOKEN_TTL_SECONDS = 3600;

export interface MockGbpProviderConfig extends GbpProviderConfig {
  /** Overrides the fixture's account id, so ACCOUNT_MISMATCH can be produced deliberately. */
  accountIdOverride?: string | undefined;
}

/**
 * Extends the real provider and overrides **only the HTTP transport** — `request()`, plus the two
 * token endpoints and revoke. Everything above that line is inherited and therefore genuinely
 * runs: `listLocations`'s pagination loop, `listReviews`'s URL construction, both mappers,
 * `starRatingToInt`, and the 401/403-vs-429-vs-5xx classification. A mock that reimplemented
 * `listReviews` to return rows would test none of it, which is the failure mode this shape exists
 * to avoid.
 *
 * **It also does not bypass our own OAuth callback.** `buildAuthorizationUrl` returns *our*
 * callback URL carrying a synthetic `code` and the **real** signed `state`, so the browser bounces
 * straight back into `GET /v1/connections/google/callback` and state verification, the
 * consume-once nonce, the browser-binding cookie check, credential storage and the connection
 * upsert all execute for real, end to end, with no Google involved. Hitting that bounced URL twice
 * exercises `INVALID_STATE`; hand-editing it exercises `ACCESS_DENIED`/`PROVIDER_ERROR`.
 *
 * Only ever constructed when `DEV_GBP_MOCK=true`, which the Joi schema forbids in production.
 */
export class MockGoogleBusinessProfileProvider extends GoogleBusinessProfileProvider {
  protected override readonly logger = new Logger(MockGoogleBusinessProfileProvider.name);
  private readonly accountIdOverride: string | undefined;

  /**
   * Self-contained fixture store for `getReviewReply`/`replyToReview` when `DEV_GBP_MOCK=true` is
   * the *only* mock flag set (no `localMockServerUrl`) — see `request()`'s own comment for why
   * these two methods need a fixture branch of their own rather than falling into the generic
   * `/reviews` list-page one below them. Keyed by the bare review id `extractReviewId` produces
   * (no `reviews/` prefix), mirroring `apps/mock-external-apis`'s own `gbp-reply-store.ts` shape.
   */
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
      // Present so the shape matches what Google actually appends, and so anyone reading the URL
      // in the address bar can tell at a glance this round trip never left the machine.
      mock: '1',
    });

    return `${this.config.callbackUrl}?${params.toString()}`;
  }

  override async refreshAccessToken(_refreshToken: string): Promise<ProviderTokenSet> {
    // Mirrors Google's real behaviour of NOT returning a refresh_token on refresh — so the
    // "keep the stored one rather than overwriting with undefined" path in
    // ProviderCredentialService is exercised rather than assumed.
    return Promise.resolve(this.mintTokens({ includeRefreshToken: false }));
  }

  override async revoke(_refreshToken: string): Promise<boolean> {
    return Promise.resolve(true);
  }

  /**
   * The single overridden seam. Routes on the URL the inherited methods built, so a wrong host or
   * a wrong path in the real provider still shows up here as an unhandled URL rather than
   * silently returning the right fixture anyway.
   *
   * `getReviewReply`/`replyToReview` (inherited, unoverridden) call `this.request(...)` the same
   * as every other method, so their write-path URLs land here too — checked by their own
   * trailing-segment pattern **before** the broader `/reviews` list-page branch below, which would
   * otherwise also match a single-review GET or a `.../reply` PUT on nothing more than a substring
   * check and silently hand back the wrong fixture shape (a list page where a single review/reply
   * was expected).
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
      // `config.localMockServerUrl` set means `legacyV4Base()` already pointed this request at
      // `apps/mock-external-apis` — a real HTTP server implementing these exact routes — so hand
      // off to the real fetch-based transport (`super.request`) instead of reimplementing its
      // fixture logic a second time here. Unset means there is no server to talk to, and the
      // request would otherwise go to the *real* `GBP_HOSTS.LEGACY_V4`: the in-memory fixture
      // store below is what makes `getReviewReply`/`replyToReview` usable under
      // `DEV_GBP_MOCK=true` alone, with no Google credentials and no local server either.
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

    // Not a 404 fixture: an unrecognized URL means the caller built a request this mock was never
    // taught about, and answering "no results" would let that pass as an empty location.
    throw new ProviderMappingError(`Mock Google Business Profile has no fixture for: ${url}`);
  }

  /**
   * Relaxed to the one setting the mock genuinely needs.
   *
   * The base class demands a client id and secret, which is right for the real provider and wrong
   * here — the whole point of the mock is working with no Google Cloud project. Overriding the
   * *check* rather than each method that calls it matters: `exchangeCode` is inherited on purpose
   * (so the account lookup and the connection upsert run for real), and overriding it to dodge the
   * assertion would have bypassed exactly the code path worth exercising.
   */
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
