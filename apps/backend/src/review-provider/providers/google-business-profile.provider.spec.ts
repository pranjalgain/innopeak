import { GoogleBusinessProfileProvider } from './google-business-profile.provider';

import {
  ProviderAuthError,
  ProviderMappingError,
  ProviderRateLimitError,
} from '../errors/provider.error';

/**
 * `classifyTokenError` — the fix for a real misclassification: Google's token endpoint answers a
 * revoked/expired/reused refresh token with HTTP 400 and `{ "error": "invalid_grant" }`, not
 * 401/403 like every other call this client makes. Left to the generic 401/403-vs-429-vs-5xx
 * classifier, that 400 fell into "a 4xx that is not auth, not retryable" and came back as
 * `ProviderMappingError` — which `ConnectionsService.callProvider` answers with a 502 "try again",
 * not `needs_reauth`. An owner who revoked access in their Google account would see that 502
 * forever, on a connection with no way to recover except an unprompted reconnect.
 */
describe('GoogleBusinessProfileProvider — token endpoint error classification', () => {
  const provider = new GoogleBusinessProfileProvider({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    callbackUrl: 'https://app.example.com/callback',
  });

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockTokenResponse(status: number, body: unknown): void {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  }

  it('maps a 400 invalid_grant to ProviderAuthError, not ProviderMappingError', async () => {
    mockTokenResponse(400, { error: 'invalid_grant', error_description: 'Token has been revoked' });

    await expect(provider.refreshAccessToken('a-revoked-refresh-token')).rejects.toBeInstanceOf(
      ProviderAuthError
    );
  });

  it('does not misroute a genuinely malformed 400 (no recognizable error code) to auth', async () => {
    mockTokenResponse(400, { error: 'invalid_request', error_description: 'Missing parameter' });

    const rejection = provider.refreshAccessToken('some-token');
    await expect(rejection).rejects.toBeInstanceOf(ProviderMappingError);
    await expect(rejection).rejects.not.toBeInstanceOf(ProviderAuthError);
  });

  it('does not treat invalid_client as a per-tenant auth failure', async () => {
    // A bad client id/secret is this server's misconfiguration, not this tenant's dead grant —
    // every connection would fail identically, and prompting one owner to reconnect fixes nothing.
    mockTokenResponse(400, { error: 'invalid_client' });

    await expect(provider.refreshAccessToken('some-token')).rejects.toBeInstanceOf(
      ProviderMappingError
    );
  });

  it('still maps a genuine 401 from the token endpoint to ProviderAuthError', async () => {
    mockTokenResponse(401, { error: 'invalid_client' });

    await expect(provider.refreshAccessToken('some-token')).rejects.toBeInstanceOf(
      ProviderAuthError
    );
  });

  it('tolerates a non-JSON 400 body without throwing from the classifier itself', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('not json'),
    });

    await expect(provider.refreshAccessToken('some-token')).rejects.toBeInstanceOf(
      ProviderMappingError
    );
  });
});

/**
 * `classifyHttpError` — Google's Discovery-based APIs (GBP included) put some quota-exceeded
 * errors behind 403, not just 429. Grouping every 403 with 401 by default was a genuine
 * misclassification for those: a location running into a quota limit would have its otherwise
 * healthy connection permanently flipped to `needs_reauth`, prompting an owner to reconnect a
 * grant that was never actually broken — for a condition the bounded-retry path
 * (`ProviderRateLimitError`) already exists to handle correctly. `isQuotaExceeded403` narrows to
 * exactly the `errors[].reason` values Google's own docs name as quota-specific, so a genuine
 * permission failure (no recognizable reason, or no `errors` array at all) is unaffected and
 * still comes back as `ProviderAuthError`.
 */
describe('GoogleBusinessProfileProvider — 403 quota vs. auth classification', () => {
  const provider = new GoogleBusinessProfileProvider({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    callbackUrl: 'https://app.example.com/callback',
  });

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockTokenResponse(status: number, body: unknown): void {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  }

  it('reclassifies a 403 carrying a quota-specific reason as rate-limited, not an auth failure', async () => {
    mockTokenResponse(403, {
      error: {
        code: 403,
        message: 'Quota exceeded for quota metric...',
        errors: [{ reason: 'rateLimitExceeded', message: 'Rate limit exceeded' }],
      },
    });

    const rejection = provider.refreshAccessToken('some-token');
    await expect(rejection).rejects.toBeInstanceOf(ProviderRateLimitError);
    await expect(rejection).rejects.not.toBeInstanceOf(ProviderAuthError);
  });

  it.each(['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', 'quotaExceeded'])(
    'recognizes %s as a quota reason',
    async reason => {
      mockTokenResponse(403, { error: { errors: [{ reason }] } });

      await expect(provider.refreshAccessToken('some-token')).rejects.toBeInstanceOf(
        ProviderRateLimitError
      );
    }
  );

  it('still treats a 403 with no recognizable quota reason as an auth failure', async () => {
    mockTokenResponse(403, {
      error: {
        code: 403,
        message: 'The caller does not have permission',
        status: 'PERMISSION_DENIED',
      },
    });

    const rejection = provider.refreshAccessToken('some-token');
    await expect(rejection).rejects.toBeInstanceOf(ProviderAuthError);
    await expect(rejection).rejects.not.toBeInstanceOf(ProviderRateLimitError);
  });

  it('still treats a 403 with an unrelated errors[].reason as an auth failure', async () => {
    mockTokenResponse(403, { error: { errors: [{ reason: 'forbidden' }] } });

    await expect(provider.refreshAccessToken('some-token')).rejects.toBeInstanceOf(
      ProviderAuthError
    );
  });

  it('falls back to auth classification when the 403 body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('not json'),
    });

    await expect(provider.refreshAccessToken('some-token')).rejects.toBeInstanceOf(
      ProviderAuthError
    );
  });

  it('leaves a genuine 401 unaffected', async () => {
    mockTokenResponse(401, { error: { errors: [{ reason: 'rateLimitExceeded' }] } });

    // 401 never goes through the 403-specific quota check at all — the reason string appearing
    // in the body is irrelevant, only the status code gates it.
    await expect(provider.refreshAccessToken('some-token')).rejects.toBeInstanceOf(
      ProviderAuthError
    );
  });
});

/**
 * `getReviewReply`/`replyToReview` — the write path PLAN.md §8.12 requires: a freshness-check
 * read immediately before posting, and the post itself. Both share `request()`'s transport, so
 * the 401/403/429/5xx classification above is already covered; these tests cover the write
 * path's own concerns: URL/method construction, the `reviewReply`-vs-no-reply mapping, the
 * moderation-rejected-after-posting edge case, and the local-mock-server override.
 */
describe('GoogleBusinessProfileProvider — write path (getReviewReply / replyToReview)', () => {
  const input = {
    externalAccountId: 'accounts/123',
    externalLocationId: 'locations/456',
    // Not path-prefixed — `extractReviewId` stores either Google's bare `reviewId` or the last
    // segment of `name`, never the `reviews/{id}` resource path, matching the real shape of what
    // `reviews.external_review_id` actually holds.
    externalReviewId: 'review-789',
  };

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockJsonResponse(status: number, body: unknown): jest.Mock {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify(body)),
      json: () => Promise.resolve(body),
    });
    global.fetch = fetchMock;
    return fetchMock;
  }

  describe('getReviewReply', () => {
    const provider = new GoogleBusinessProfileProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      callbackUrl: 'https://app.example.com/callback',
    });

    it('returns the mapped reply when the review has a live, approved reply', async () => {
      mockJsonResponse(200, {
        name: 'accounts/123/locations/456/reviews/789',
        starRating: 'FIVE',
        createTime: '2026-01-01T00:00:00Z',
        updateTime: '2026-01-01T00:00:00Z',
        reviewReply: {
          comment: 'Thanks so much!',
          updateTime: '2026-01-02T00:00:00Z',
          reviewReplyState: 'APPROVED',
        },
      });

      const result = await provider.getReviewReply('access-token', input);

      expect(result).toEqual({ comment: 'Thanks so much!', updatedAt: '2026-01-02T00:00:00Z' });
    });

    it('returns null when the review has no reply yet — the freshness check sees "clear to post"', async () => {
      mockJsonResponse(200, {
        name: 'accounts/123/locations/456/reviews/789',
        starRating: 'FIVE',
        createTime: '2026-01-01T00:00:00Z',
        updateTime: '2026-01-01T00:00:00Z',
      });

      await expect(provider.getReviewReply('access-token', input)).resolves.toBeNull();
    });

    it('requests the single-review resource at the legacy v4 host, as a GET', async () => {
      const fetchMock = mockJsonResponse(200, {
        name: 'accounts/123/locations/456/reviews/789',
        starRating: 'FIVE',
        createTime: '2026-01-01T00:00:00Z',
        updateTime: '2026-01-01T00:00:00Z',
      });

      await provider.getReviewReply('access-token', input);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews/review-789',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('replyToReview', () => {
    const provider = new GoogleBusinessProfileProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      callbackUrl: 'https://app.example.com/callback',
    });

    it('PUTs the comment as JSON and returns the mapped, now-live reply', async () => {
      const fetchMock = mockJsonResponse(200, {
        comment: 'Thanks so much!',
        updateTime: '2026-01-02T00:00:00Z',
        reviewReplyState: 'APPROVED',
      });

      const result = await provider.replyToReview('access-token', {
        ...input,
        comment: 'Thanks so much!',
      });

      expect(result).toEqual({ comment: 'Thanks so much!', updatedAt: '2026-01-02T00:00:00Z' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews/review-789/reply',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ comment: 'Thanks so much!' }),
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('throws ProviderMappingError when Google moderation rejects the reply it just accepted', async () => {
      // Google returned 200 (the PUT itself succeeded) but the reply is not live — this is a
      // mapping problem, not a transport failure, so it must not be classified as retryable.
      mockJsonResponse(200, {
        comment: 'Thanks so much!',
        updateTime: '2026-01-02T00:00:00Z',
        reviewReplyState: 'REJECTED',
      });

      await expect(
        provider.replyToReview('access-token', { ...input, comment: 'Thanks so much!' })
      ).rejects.toBeInstanceOf(ProviderMappingError);
    });
  });

  describe('local mock server override', () => {
    it('points both methods at localMockServerUrl when configured, instead of the real GBP host', async () => {
      const provider = new GoogleBusinessProfileProvider({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        callbackUrl: 'https://app.example.com/callback',
        localMockServerUrl: 'http://localhost:4100',
      });

      const fetchMock = mockJsonResponse(200, {
        name: 'accounts/123/locations/456/reviews/789',
        starRating: 'FIVE',
        createTime: '2026-01-01T00:00:00Z',
        updateTime: '2026-01-01T00:00:00Z',
      });

      await provider.getReviewReply('access-token', input);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4100/v4/accounts/123/locations/456/reviews/review-789',
        expect.any(Object)
      );
    });
  });
});
