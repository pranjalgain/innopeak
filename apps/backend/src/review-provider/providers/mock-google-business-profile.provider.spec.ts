import { MockGoogleBusinessProfileProvider } from './mock-google-business-profile.provider';

import { GBP_HOSTS } from '../constants/review-provider.constants';

const input = {
  externalAccountId: 'accounts/108327761122',
  externalLocationId: 'locations/12345678901234567890',
  externalReviewId: 'review-789',
};

const baseConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  callbackUrl: 'https://app.example.com/callback',
};

/**
 * Regression coverage for the bug `request()`'s own doc comment now explains: `getReviewReply`/
 * `replyToReview` are inherited (not overridden), so they dispatch through this same mock
 * transport — which, before this fix, had no branch for their URLs at all and either threw
 * (`localMockServerUrl` set) or silently matched the broader `/reviews` list-page branch on a
 * false-positive substring check (`localMockServerUrl` unset), returning the wrong fixture shape.
 */
describe('MockGoogleBusinessProfileProvider — getReviewReply/replyToReview', () => {
  describe('without localMockServerUrl (DEV_GBP_MOCK alone)', () => {
    const provider = new MockGoogleBusinessProfileProvider(baseConfig);

    it('reports no reply yet for a review nothing has replied to', async () => {
      await expect(provider.getReviewReply('mock-access-token', input)).resolves.toBeNull();
    });

    it('stores a posted reply and then reports it on the next freshness-check read', async () => {
      const posted = await provider.replyToReview('mock-access-token', {
        ...input,
        comment: 'Thanks so much for the kind words!',
      });

      expect(posted.comment).toBe('Thanks so much for the kind words!');

      const reread = await provider.getReviewReply('mock-access-token', input);
      expect(reread).toEqual({
        comment: 'Thanks so much for the kind words!',
        updatedAt: posted.updatedAt,
      });
    });

    it('keeps each review id independently addressable', async () => {
      await provider.replyToReview('mock-access-token', { ...input, comment: 'For review A' });

      await expect(
        provider.getReviewReply('mock-access-token', { ...input, externalReviewId: 'review-999' })
      ).resolves.toBeNull();
    });

    it('still serves the unrelated reviews-list fixture unchanged', async () => {
      const page = await provider.listReviews('mock-access-token', {
        externalAccountId: input.externalAccountId,
        externalLocationId: input.externalLocationId,
      });

      expect(page.reviews.length).toBeGreaterThan(0);
    });
  });

  describe('with localMockServerUrl set (USE_LOCAL_MOCK_SERVER=true)', () => {
    const provider = new MockGoogleBusinessProfileProvider({
      ...baseConfig,
      localMockServerUrl: 'http://localhost:4100',
    });

    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('delegates getReviewReply to a real fetch against the local mock server, not a thrown ProviderMappingError', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve({ name: 'whatever', reviewReply: undefined }),
      });
      global.fetch = fetchMock;

      await expect(provider.getReviewReply('mock-access-token', input)).resolves.toBeNull();

      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:4100/v4/${input.externalAccountId}/${input.externalLocationId}/reviews/${input.externalReviewId}`,
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('delegates replyToReview to a real fetch, not a thrown ProviderMappingError', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () =>
          Promise.resolve({
            comment: 'Thanks!',
            updateTime: '2026-03-12T09:01:11.402Z',
            reviewReplyState: 'APPROVED',
          }),
      });
      global.fetch = fetchMock;

      const result = await provider.replyToReview('mock-access-token', {
        ...input,
        comment: 'Thanks!',
      });

      expect(result).toEqual({ comment: 'Thanks!', updatedAt: '2026-03-12T09:01:11.402Z' });
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:4100/v4/${input.externalAccountId}/${input.externalLocationId}/reviews/${input.externalReviewId}/reply`,
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('still serves listReviews from the in-process fixture, unaffected by localMockServerUrl', async () => {
      const page = await provider.listReviews('mock-access-token', {
        externalAccountId: input.externalAccountId,
        externalLocationId: input.externalLocationId,
      });

      expect(page.reviews.length).toBeGreaterThan(0);
      // The real LEGACY_V4 host, never the local mock server — listReviews/listLocations are
      // deliberately unaffected by this toggle (see GbpProviderConfig.localMockServerUrl's own
      // comment on the real provider).
      expect(GBP_HOSTS.LEGACY_V4).not.toContain('localhost');
    });
  });
});
