import { GoogleBusinessProfileProvider } from './google-business-profile.provider';

import {
  ProviderAuthError,
  ProviderMappingError,
  ProviderRateLimitError,
} from '../errors/provider.error';

// Regression: the token endpoint answers a revoked refresh token with 400 `invalid_grant`, which the
// generic classifier turned into a retryable 502 instead of `needs_reauth`.
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
    // A bad client id/secret is this server's misconfiguration, not a dead grant: reconnecting fixes nothing.
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

// Regression: Google puts some quota errors behind 403, which used to flip a healthy connection to
// `needs_reauth`. Only documented quota `errors[].reason` values are reclassified; other 403s stay auth errors.
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

    // The quota check is 403-only; a quota reason in a 401 body is irrelevant.
    await expect(provider.refreshAccessToken('some-token')).rejects.toBeInstanceOf(
      ProviderAuthError
    );
  });
});

// Both share `request()`'s transport, so error classification is covered above; these cover URL/method
// construction, reply mapping, moderation-rejected-after-post, and the local-mock-server override.
describe('GoogleBusinessProfileProvider — write path (getReviewReply / replyToReview)', () => {
  const input = {
    externalAccountId: 'accounts/123',
    externalLocationId: 'locations/456',
    // Not path-prefixed: `reviews.external_review_id` holds the bare id, never the `reviews/{id}` path.
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
      // The PUT returned 200 but the reply is not live: a mapping problem, not retryable.
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

describe('GoogleBusinessProfileProvider.revoke', () => {
  const provider = new GoogleBusinessProfileProvider({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    callbackUrl: 'https://app.example.com/callback',
  });
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function respond(status: number, body: unknown): void {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  }

  it('is true when Google confirms', async () => {
    respond(200, {});

    await expect(provider.revoke('token')).resolves.toBe(true);
  });

  it('counts a token that is already revoked or expired as done (400 invalid_token)', async () => {
    respond(400, { error: 'invalid_token' });

    await expect(provider.revoke('token')).resolves.toBe(true);
  });

  it('is false for any other refusal and for a network failure', async () => {
    respond(400, { error: 'invalid_request' });
    await expect(provider.revoke('token')).resolves.toBe(false);

    respond(503, {});
    await expect(provider.revoke('token')).resolves.toBe(false);

    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    await expect(provider.revoke('token')).resolves.toBe(false);
  });
});
