import { MESSAGES } from '@common/constants/messages.constants';
import type { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import type { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import {
  ProviderAuthError,
  ProviderMappingError,
  ProviderNotFoundError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from '@review-provider/errors/provider.error';
import type { ProviderCredentialService } from '@review-provider/provider-credential.service';
import type { ReviewProvider } from '@review-provider/providers/review-provider.provider';

import { ReviewPostQueueService } from './review-post-queue.service';
import type { ReviewPostQueue } from './review-post.queue';

const job = { tenantId: 'tenant-1', reviewId: 'review-1', responseId: 'response-1' };
const claimed = { id: 'response-1', content: 'Thanks for visiting!\nSee you soon.' };
const review = {
  id: 'review-1',
  locationId: 'location-1',
  externalReviewId: 'ext-1',
  removedUpstreamAt: null,
};
const LIVE_AT = '2026-03-12T10:00:00.000Z';

describe('ReviewPostQueueService', () => {
  let target: ReviewPostQueueService;
  let provider: { getReviewReply: jest.Mock; replyToReview: jest.Mock; listReviews: jest.Mock };
  let credentialService: { resolveAccessToken: jest.Mock };
  let connectionsDbService: {
    findConnectionByTenant: jest.Mock;
    findLocationForTenant: jest.Mock;
    updateTokenExpiry: jest.Mock;
    markNeedsReauth: jest.Mock;
  };
  let reviewSyncDbService: {
    claimResponseForPosting: jest.Mock;
    findReviewForTenant: jest.Mock;
    markResponsePosted: jest.Mock;
    markResponsePostFailed: jest.Mock;
    supersedeForExternalReply: jest.Mock;
    releaseResponseClaim: jest.Mock;
    importLiveReply: jest.Mock;
    markReviewRemovedUpstream: jest.Mock;
  };
  let reviewPostQueue: { addPostJob: jest.Mock };

  beforeEach(() => {
    provider = {
      getReviewReply: jest.fn().mockResolvedValue(null),
      // The account/location path still answers unless a test says otherwise.
      listReviews: jest.fn().mockResolvedValue({ reviews: [], nextPageToken: null, totalCount: 0 }),
      replyToReview: jest.fn().mockResolvedValue({ comment: claimed.content, updatedAt: LIVE_AT }),
    };
    credentialService = {
      resolveAccessToken: jest
        .fn()
        .mockResolvedValue({ accessToken: 'token', refreshedExpiresAt: null }),
    };
    connectionsDbService = {
      findConnectionByTenant: jest.fn().mockResolvedValue({
        id: 'conn-1',
        providerAccountId: 'accounts/1',
        credentialReference: 'cred',
        tokenExpiresAt: null,
      }),
      findLocationForTenant: jest.fn().mockResolvedValue({ externalLocationId: 'locations/1' }),
      updateTokenExpiry: jest.fn().mockResolvedValue(undefined),
      markNeedsReauth: jest.fn().mockResolvedValue(undefined),
    };
    reviewSyncDbService = {
      claimResponseForPosting: jest.fn().mockResolvedValue(claimed),
      findReviewForTenant: jest.fn().mockResolvedValue(review),
      markResponsePosted: jest.fn().mockResolvedValue({ id: 'response-1' }),
      markResponsePostFailed: jest.fn().mockResolvedValue({ id: 'response-1' }),
      markReviewRemovedUpstream: jest.fn().mockResolvedValue(undefined),
      supersedeForExternalReply: jest.fn().mockResolvedValue(true),
      releaseResponseClaim: jest.fn().mockResolvedValue(true),
      importLiveReply: jest.fn().mockResolvedValue(true),
    };
    reviewPostQueue = { addPostJob: jest.fn().mockResolvedValue(undefined) };

    target = new ReviewPostQueueService(
      provider as unknown as ReviewProvider,
      credentialService as unknown as ProviderCredentialService,
      connectionsDbService as unknown as ConnectionsDbService,
      reviewSyncDbService as unknown as ReviewSyncDbService,
      reviewPostQueue as unknown as ReviewPostQueue
    );
  });

  describe('claiming', () => {
    it('does nothing when the response is not claimable', async () => {
      reviewSyncDbService.claimResponseForPosting.mockResolvedValue(null);

      await target.postResponse(job);

      expect(reviewSyncDbService.findReviewForTenant).not.toHaveBeenCalled();
      expect(provider.getReviewReply).not.toHaveBeenCalled();
    });

    it('marks the response failed and throws when the review row is missing', async () => {
      reviewSyncDbService.findReviewForTenant.mockResolvedValue(null);

      await expect(target.postResponse(job)).rejects.toThrow('Review review-1 not found');

      expect(reviewSyncDbService.markResponsePostFailed).toHaveBeenCalledTimes(1);
    });

    it('fails a response for a review removed on Google without calling Google', async () => {
      reviewSyncDbService.findReviewForTenant.mockResolvedValue({
        ...review,
        removedUpstreamAt: '2026-03-13T00:00:00.000Z',
      });

      await expect(target.postResponse(job)).resolves.toBeUndefined();

      expect(provider.getReviewReply).not.toHaveBeenCalled();
      expect(reviewSyncDbService.markResponsePostFailed).toHaveBeenCalledWith({
        responseId: 'response-1',
        errorMessage: MESSAGES.REVIEWS.POST_FAILED_REVIEW_REMOVED,
      });
    });
  });

  describe('freshness check and posting', () => {
    it("posts the reply and records it as posted with Google's own timestamp", async () => {
      await target.postResponse(job);

      expect(provider.replyToReview).toHaveBeenCalledWith('token', {
        externalAccountId: 'accounts/1',
        externalLocationId: 'locations/1',
        externalReviewId: 'ext-1',
        comment: claimed.content,
      });
      expect(reviewSyncDbService.markResponsePosted).toHaveBeenCalledWith({
        responseId: 'response-1',
        reviewId: 'review-1',
        postedAt: LIVE_AT,
      });
    });

    it('persists a refreshed token expiry', async () => {
      credentialService.resolveAccessToken.mockResolvedValue({
        accessToken: 'token',
        refreshedExpiresAt: '2026-04-01T00:00:00.000Z',
      });

      await target.postResponse(job);

      expect(connectionsDbService.updateTokenExpiry).toHaveBeenCalledWith(
        'conn-1',
        '2026-04-01T00:00:00.000Z'
      );
    });

    it('recognises its own earlier post even when Google normalised the whitespace, and does not re-send', async () => {
      provider.getReviewReply.mockResolvedValue({
        comment: '  Thanks for visiting! See   you soon.\r\n',
        updatedAt: LIVE_AT,
      });

      await target.postResponse(job);

      expect(provider.replyToReview).not.toHaveBeenCalled();
      expect(reviewSyncDbService.supersedeForExternalReply).not.toHaveBeenCalled();
      expect(reviewSyncDbService.markResponsePosted).toHaveBeenCalledWith(
        expect.objectContaining({ postedAt: LIVE_AT })
      );
    });

    it('aborts and supersedes when a different reply is already live', async () => {
      provider.getReviewReply.mockResolvedValue({
        comment: 'Replied on Google.',
        updatedAt: LIVE_AT,
      });

      await target.postResponse(job);

      expect(provider.replyToReview).not.toHaveBeenCalled();
      expect(reviewSyncDbService.supersedeForExternalReply).toHaveBeenCalledWith({
        responseId: 'response-1',
        reviewId: 'review-1',
        tenantId: 'tenant-1',
        content: 'Replied on Google.',
        postedAt: LIVE_AT,
      });
      expect(reviewSyncDbService.markResponsePosted).not.toHaveBeenCalled();
    });
  });

  describe('a lost compare-and-swap while posting', () => {
    it('imports the live reply instead of claiming success when the response stopped being approved', async () => {
      reviewSyncDbService.markResponsePosted.mockResolvedValue(null);

      await target.postResponse(job);

      expect(reviewSyncDbService.importLiveReply).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        reviewId: 'review-1',
        content: claimed.content,
        postedAt: LIVE_AT,
      });
      expect(reviewSyncDbService.markResponsePostFailed).not.toHaveBeenCalled();
    });

    it('imports the external reply when superseding found the response no longer approved', async () => {
      provider.getReviewReply.mockResolvedValue({
        comment: 'Replied on Google.',
        updatedAt: LIVE_AT,
      });
      reviewSyncDbService.supersedeForExternalReply.mockResolvedValue(false);

      await target.postResponse(job);

      expect(reviewSyncDbService.importLiveReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Replied on Google.' })
      );
    });
  });

  describe('provider failures', () => {
    it('records a dead grant on the connection and fails without retrying', async () => {
      provider.getReviewReply.mockRejectedValue(new ProviderAuthError('revoked'));

      await expect(target.postResponse(job)).rejects.toBeInstanceOf(ProviderAuthError);

      expect(connectionsDbService.markNeedsReauth).toHaveBeenCalledWith('conn-1');
      expect(reviewSyncDbService.markResponsePostFailed).toHaveBeenCalledWith({
        responseId: 'response-1',
        errorMessage: MESSAGES.REVIEWS.POST_FAILED_RECONNECT,
      });
      expect(reviewPostQueue.addPostJob).not.toHaveBeenCalled();
    });

    // Regression: a review deleted on Google failed with Google's raw 404 text and stayed retryable.
    it.each([
      ['checking for a live reply', 'getReviewReply'],
      ['posting the reply', 'replyToReview'],
    ] as const)(
      'records the review as removed on Google when it 404s while %s and the location is still reachable',
      async (_label, method) => {
        provider[method].mockRejectedValue(
          new ProviderNotFoundError('Google has no such resource (404): NOT_FOUND')
        );

        await expect(target.postResponse(job)).resolves.toBeUndefined();

        expect(reviewSyncDbService.markReviewRemovedUpstream).toHaveBeenCalledWith({
          reviewId: job.reviewId,
          tenantId: job.tenantId,
        });
        expect(reviewSyncDbService.markResponsePostFailed).toHaveBeenCalledWith({
          responseId: 'response-1',
          errorMessage: MESSAGES.REVIEWS.POST_FAILED_REVIEW_REMOVED,
        });
        expect(reviewPostQueue.addPostJob).not.toHaveBeenCalled();
      }
    );

    // Regression: a 404 for a location this account can no longer reach marked every pending review removed, for good.
    it('does not mark the review removed when the location itself is gone, and says so', async () => {
      provider.getReviewReply.mockRejectedValue(new ProviderNotFoundError('404 review'));
      provider.listReviews.mockRejectedValue(new ProviderNotFoundError('404 location'));

      await expect(target.postResponse(job)).resolves.toBeUndefined();

      expect(reviewSyncDbService.markReviewRemovedUpstream).not.toHaveBeenCalled();
      expect(reviewSyncDbService.markResponsePostFailed).toHaveBeenCalledWith({
        responseId: 'response-1',
        errorMessage: MESSAGES.REVIEWS.POST_FAILED_LOCATION_UNAVAILABLE,
      });
      expect(reviewPostQueue.addPostJob).not.toHaveBeenCalled();
    });

    // Regression: the check read the location alone, which ignores the account, so a location moved to another
    // account still looked reachable and every review posted to was marked removed.
    it('checks the same account/location path that 404ed, not the location alone', async () => {
      provider.getReviewReply.mockRejectedValue(new ProviderNotFoundError('404 review'));

      await target.postResponse(job);

      expect(provider.listReviews).toHaveBeenCalledWith('token', {
        externalAccountId: 'accounts/1',
        externalLocationId: 'locations/1',
        pageSize: 1,
      });
    });

    // Regression: an unmappable review in the listing (Google answered 200) was read as "location gone".
    it('still marks the review removed when the location listing answers but cannot be mapped', async () => {
      provider.getReviewReply.mockRejectedValue(new ProviderNotFoundError('404 review'));
      provider.listReviews.mockRejectedValue(new ProviderMappingError('Unknown starRating "SIX"'));

      await target.postResponse(job);

      expect(reviewSyncDbService.markReviewRemovedUpstream).toHaveBeenCalledWith({
        reviewId: job.reviewId,
        tenantId: job.tenantId,
      });
      expect(reviewSyncDbService.markResponsePostFailed).toHaveBeenCalledWith({
        responseId: 'response-1',
        errorMessage: MESSAGES.REVIEWS.POST_FAILED_REVIEW_REMOVED,
      });
    });

    it('retries later, deciding nothing, when the location check itself hits a transient failure', async () => {
      provider.getReviewReply.mockRejectedValue(new ProviderNotFoundError('404 review'));
      provider.listReviews.mockRejectedValue(new ProviderUnavailableError('Google returned 503'));

      await target.postResponse(job);

      expect(reviewSyncDbService.markReviewRemovedUpstream).not.toHaveBeenCalled();
      expect(reviewSyncDbService.markResponsePostFailed).not.toHaveBeenCalled();
      expect(reviewPostQueue.addPostJob).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 2 }),
        expect.anything()
      );
    });

    it('still fails the reply with the clear reason when recording the removal fails', async () => {
      provider.getReviewReply.mockRejectedValue(new ProviderNotFoundError('404'));
      reviewSyncDbService.markReviewRemovedUpstream.mockRejectedValue(new Error('db blip'));

      await target.postResponse(job);

      expect(reviewSyncDbService.markResponsePostFailed).toHaveBeenCalledWith({
        responseId: 'response-1',
        errorMessage: MESSAGES.REVIEWS.POST_FAILED_REVIEW_REMOVED,
      });
    });

    // Regression: Google's raw 4xx body (JSON) was stored as the reason and shown to the owner in a toast.
    it.each([
      [
        'a rejected reply (4xx)',
        new ProviderMappingError('Google rejected the request (400): { "error": {} }'),
        'POST_FAILED_REJECTED',
      ],
      ['an unexpected error', new Error('socket hang up'), 'POST_FAILED_UNKNOWN'],
    ] as const)(
      'stores our own reason, never the raw error text, for %s',
      async (_label, error, key) => {
        provider.getReviewReply.mockRejectedValue(error);

        await expect(target.postResponse(job)).rejects.toBe(error);

        expect(reviewSyncDbService.markResponsePostFailed).toHaveBeenCalledWith({
          responseId: 'response-1',
          errorMessage: MESSAGES.REVIEWS[key],
        });
      }
    );

    it('does not let a failing post_failed write mask the original error', async () => {
      provider.getReviewReply.mockRejectedValue(new ProviderAuthError('revoked'));
      reviewSyncDbService.markResponsePostFailed.mockRejectedValue(new Error('db down'));

      await expect(target.postResponse(job)).rejects.toThrow('revoked');
    });

    it('fails a non-provider error without retrying', async () => {
      connectionsDbService.findLocationForTenant.mockResolvedValue(null);

      await expect(target.postResponse(job)).rejects.toThrow('Location location-1 not found');

      expect(reviewPostQueue.addPostJob).not.toHaveBeenCalled();
      expect(reviewSyncDbService.markResponsePostFailed).toHaveBeenCalledTimes(1);
    });
  });

  describe('transient provider failures', () => {
    it('releases the claim and reschedules attempt 2 after a minute, without failing the response', async () => {
      provider.getReviewReply.mockRejectedValue(new ProviderUnavailableError('502'));

      await expect(target.postResponse(job)).resolves.toBeUndefined();

      expect(reviewSyncDbService.releaseResponseClaim).toHaveBeenCalledWith({
        responseId: 'response-1',
        tenantId: 'tenant-1',
      });
      expect(reviewPostQueue.addPostJob).toHaveBeenCalledWith(
        { ...job, attempt: 2 },
        { delayMs: 60_000 }
      );
      expect(reviewSyncDbService.markResponsePostFailed).not.toHaveBeenCalled();
    });

    it('backs off further on the second retry', async () => {
      provider.getReviewReply.mockRejectedValue(new ProviderUnavailableError('502'));

      await target.postResponse({ ...job, attempt: 2 });

      expect(reviewPostQueue.addPostJob).toHaveBeenCalledWith(
        { ...job, attempt: 3 },
        { delayMs: 5 * 60_000 }
      );
    });

    it('honours a longer Retry-After than its own backoff', async () => {
      provider.getReviewReply.mockRejectedValue(new ProviderRateLimitError('429', 600));

      await target.postResponse(job);

      expect(reviewPostQueue.addPostJob).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 2 }),
        { delayMs: 600_000 }
      );
    });

    it('gives up and fails the response once attempts are exhausted', async () => {
      provider.getReviewReply.mockRejectedValue(new ProviderUnavailableError('502'));

      await expect(target.postResponse({ ...job, attempt: 3 })).rejects.toBeInstanceOf(
        ProviderUnavailableError
      );

      expect(reviewPostQueue.addPostJob).not.toHaveBeenCalled();
      expect(reviewSyncDbService.markResponsePostFailed).toHaveBeenCalledWith({
        responseId: 'response-1',
        errorMessage: MESSAGES.REVIEWS.POST_FAILED_UNAVAILABLE,
      });
    });

    it('fails the response when the retry itself cannot be queued', async () => {
      provider.getReviewReply.mockRejectedValue(new ProviderUnavailableError('502'));
      reviewPostQueue.addPostJob.mockRejectedValue(new Error('redis down'));

      await expect(target.postResponse(job)).rejects.toBeInstanceOf(ProviderUnavailableError);

      expect(reviewSyncDbService.markResponsePostFailed).toHaveBeenCalledTimes(1);
    });
  });

  describe('a database failure after Google was reached', () => {
    it('does not mark the response failed — it schedules a re-check after the claim goes stale', async () => {
      reviewSyncDbService.markResponsePosted.mockRejectedValue(new Error('db blip'));

      await expect(target.postResponse(job)).resolves.toBeUndefined();

      expect(reviewSyncDbService.markResponsePostFailed).not.toHaveBeenCalled();
      expect(reviewSyncDbService.releaseResponseClaim).not.toHaveBeenCalled();
      expect(reviewPostQueue.addPostJob).toHaveBeenCalledWith(
        { ...job, attempt: 2 },
        { delayMs: 6 * 60_000 }
      );
    });

    it('rethrows, still without marking failed, once attempts are exhausted', async () => {
      reviewSyncDbService.markResponsePosted.mockRejectedValue(new Error('db blip'));

      await expect(target.postResponse({ ...job, attempt: 3 })).rejects.toThrow('db blip');

      expect(reviewSyncDbService.markResponsePostFailed).not.toHaveBeenCalled();
    });

    it('rethrows when the re-check cannot be queued either', async () => {
      reviewSyncDbService.markResponsePosted.mockRejectedValue(new Error('db blip'));
      reviewPostQueue.addPostJob.mockRejectedValue(new Error('redis down'));

      await expect(target.postResponse(job)).rejects.toThrow('db blip');
    });
  });
});
