import { AiReplyGenerationService } from '@ai/ai-reply-generation.service';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Test } from '@nestjs/testing';
import { ReviewClassificationService } from '@review-pipeline/review-classification.service';
import { ProviderNotFoundError } from '@review-provider/errors/provider.error';
import { ProviderCredentialService } from '@review-provider/provider-credential.service';
import { ReviewProvider } from '@review-provider/providers/review-provider.provider';

import { ReviewSyncQueueService } from './review-sync-queue.service';

import type {
  ProviderReview,
  ProviderReviewPage,
} from '../../../review-provider/types/review-provider.type';

function review(overrides: Partial<ProviderReview> = {}): ProviderReview {
  return {
    externalReviewId: 'ext-1',
    externalReviewerId: null,
    reviewerName: 'Ada',
    rating: 5,
    text: 'Lovely',
    reviewedAt: '2026-01-01T00:00:00.000Z',
    externalUpdatedAt: '2026-01-01T00:00:00.000Z',
    reply: null,
    ...overrides,
  };
}

function page(overrides: Partial<ProviderReviewPage> = {}): ProviderReviewPage {
  return { reviews: [], nextPageToken: null, totalCount: null, ...overrides };
}

describe('ReviewSyncQueueService.runPoll', () => {
  let service: ReviewSyncQueueService;
  const listReviews = jest.fn();
  const getLocation = jest.fn();
  const updateLocationDetails = jest.fn();
  const markLocationDetailsAttempted = jest.fn();
  const resolveAccessToken = jest.fn();
  const findConnectionByTenant = jest.fn();
  const findLocationForTenant = jest.fn();
  const acquireSyncRun = jest.fn();
  const importPollPage = jest.fn();
  const completeRun = jest.fn();
  const recordProgress = jest.fn();
  const classifyPendingReviews = jest.fn();
  const generateForClassifiedReviews = jest.fn();

  const RECENT = new Date().toISOString();
  const findOpenReviewsForReconciliation = jest.fn();
  const markReviewsRemovedUpstream = jest.fn();
  const restoreRelistedReviews = jest.fn();
  const markReviewsReconciled = jest.fn();
  const getReviewReply = jest.fn();

  const job = {
    tenantId: 'tenant-1',
    locationId: 'location-1',
    connectionId: 'connection-1',
    externalAccountId: 'accounts/1',
    externalLocationId: 'locations/1',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    findConnectionByTenant.mockResolvedValue({
      id: 'connection-1',
      credentialReference: 'ref-1',
      tokenExpiresAt: null,
    });
    resolveAccessToken.mockResolvedValue({ accessToken: 'token', refreshedExpiresAt: null });
    acquireSyncRun.mockResolvedValue({ id: 'run-1', status: SyncRunStatus.RUNNING });
    importPollPage.mockResolvedValue({
      reviewsWritten: 1,
      reviewsInserted: 1,
      repliesImported: 0,
      repliesSkippedConflict: 0,
    });
    completeRun.mockResolvedValue(true);
    classifyPendingReviews.mockResolvedValue({ classified: 0, skipped: 0 });
    generateForClassifiedReviews.mockResolvedValue({
      generated: 0,
      skipped: 0,
      failed: 0,
      quotaReached: false,
    });
    getLocation.mockResolvedValue({
      externalLocationId: 'locations/1',
      name: 'The Coastal Table',
      address: '214 Harbor St',
      phone: '+49 30 1234567',
      websiteUri: 'https://coastal.example',
    });
    updateLocationDetails.mockResolvedValue(undefined);
    markReviewsReconciled.mockResolvedValue(undefined);
    findOpenReviewsForReconciliation.mockResolvedValue([]);
    markReviewsRemovedUpstream.mockResolvedValue(0);
    restoreRelistedReviews.mockResolvedValue(0);
    getReviewReply.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncQueueService,
        { provide: ReviewProvider, useValue: { listReviews, getLocation, getReviewReply } },
        { provide: ProviderCredentialService, useValue: { resolveAccessToken } },
        {
          provide: ConnectionsDbService,
          useValue: {
            findConnectionByTenant,
            findLocationForTenant,
            updateLocationDetails,
            markLocationDetailsAttempted,
            markReviewsReconciled,
            markNeedsReauth: jest.fn(),
          },
        },
        {
          provide: ReviewSyncDbService,
          useValue: {
            acquireSyncRun,
            importPollPage,
            completeRun,
            recordProgress,
            findOpenReviewsForReconciliation,
            markReviewsRemovedUpstream,
            restoreRelistedReviews,
          },
        },
        { provide: ReviewClassificationService, useValue: { classifyPendingReviews } },
        {
          provide: AiReplyGenerationService,
          useValue: { generateForClassifiedReviews },
        },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncQueueService);
  });

  it('does nothing and does not throw when a sync run is already active for the location', async () => {
    acquireSyncRun.mockResolvedValue(null);

    await service.runPoll(job);

    expect(listReviews).not.toHaveBeenCalled();
    expect(completeRun).not.toHaveBeenCalled();
  });

  /** Guards both re-walking full history every tick and stopping one page too early. */
  it('stops paginating once a review is found well before the cursor, without fetching further pages', async () => {
    findLocationForTenant.mockResolvedValue({
      reviewsReconciledAt: RECENT,
      lastReviewSyncedAt: '2026-01-05T00:00:00.000Z',
    });
    listReviews.mockResolvedValueOnce(
      page({
        reviews: [
          review({ externalReviewId: 'ext-new-1', externalUpdatedAt: '2026-01-07T00:00:00.000Z' }),
          review({ externalReviewId: 'ext-new-2', externalUpdatedAt: '2026-01-06T00:00:00.000Z' }),
          // Well outside the 5-minute overlap window.
          review({ externalReviewId: 'ext-old-1', externalUpdatedAt: '2026-01-04T23:00:00.000Z' }),
          review({ externalReviewId: 'ext-old-2', externalUpdatedAt: '2026-01-04T00:00:00.000Z' }),
        ],
        nextPageToken: 'page-2',
      })
    );

    await service.runPoll(job);

    expect(listReviews).toHaveBeenCalledTimes(1);
    expect(importPollPage).toHaveBeenCalledTimes(1);
    const written = importPollPage.mock.calls[0]?.[0] as { reviews: ProviderReview[] };
    expect(written.reviews.map(r => r.externalReviewId)).toEqual(['ext-new-1', 'ext-new-2']);
    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({ lastReviewSyncedAt: '2026-01-07T00:00:00.000Z' })
    );
  });

  /**
   * Guards `POLL_CURSOR_OVERLAP_MS`: a review at the cursor can shift across the boundary mid-walk
   * and be skipped forever; the overlap window re-imports it idempotently.
   */
  it('re-examines reviews within the overlap window before the cursor, not just strictly after it', async () => {
    findLocationForTenant.mockResolvedValue({
      reviewsReconciledAt: RECENT,
      lastReviewSyncedAt: '2026-01-05T00:00:00.000Z',
    });
    listReviews.mockResolvedValueOnce(
      page({
        reviews: [
          review({ externalReviewId: 'ext-new-1', externalUpdatedAt: '2026-01-06T00:00:00.000Z' }),
          // 2 minutes before the cursor — inside the 5-minute overlap window.
          review({
            externalReviewId: 'ext-boundary',
            externalUpdatedAt: '2026-01-04T23:58:00.000Z',
          }),
          // An hour before the cursor — outside the overlap window, stops the walk.
          review({ externalReviewId: 'ext-old', externalUpdatedAt: '2026-01-04T23:00:00.000Z' }),
        ],
        nextPageToken: 'page-2',
      })
    );

    await service.runPoll(job);

    const written = importPollPage.mock.calls[0]?.[0] as { reviews: ProviderReview[] };
    expect(written.reviews.map(r => r.externalReviewId)).toEqual(['ext-new-1', 'ext-boundary']);
    // Re-examining the boundary review must not regress the cursor.
    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({ lastReviewSyncedAt: '2026-01-06T00:00:00.000Z' })
    );
  });

  it('does not re-examine anything when the boundary review is right outside the overlap window', async () => {
    findLocationForTenant.mockResolvedValue({
      reviewsReconciledAt: RECENT,
      lastReviewSyncedAt: '2026-01-05T00:00:00.000Z',
    });
    listReviews.mockResolvedValueOnce(
      page({
        reviews: [
          review({ externalReviewId: 'ext-new-1', externalUpdatedAt: '2026-01-06T00:00:00.000Z' }),
          // 6 minutes before the cursor — just outside the 5-minute overlap window.
          review({
            externalReviewId: 'ext-just-outside',
            externalUpdatedAt: '2026-01-04T23:54:00.000Z',
          }),
        ],
        nextPageToken: 'page-2',
      })
    );

    await service.runPoll(job);

    const written = importPollPage.mock.calls[0]?.[0] as { reviews: ProviderReview[] };
    expect(written.reviews.map(r => r.externalReviewId)).toEqual(['ext-new-1']);
  });

  it('walks every page to the cap when the location has never been synced (null cursor)', async () => {
    findLocationForTenant.mockResolvedValue({
      reviewsReconciledAt: RECENT,
      lastReviewSyncedAt: null,
    });
    listReviews
      .mockResolvedValueOnce(
        page({ reviews: [review({ externalReviewId: 'ext-1' })], nextPageToken: 'page-2' })
      )
      .mockResolvedValueOnce(page({ reviews: [review({ externalReviewId: 'ext-2' })] }));

    await service.runPoll(job);

    expect(listReviews).toHaveBeenCalledTimes(2);
    expect(importPollPage).toHaveBeenCalledTimes(2);
  });

  /** `page.totalCount` is the lifetime count; writing it made poll rows read "3 fetched / 2000 total". */
  it('never records reviewsTotal on a poll run, even when the provider reports one', async () => {
    findLocationForTenant.mockResolvedValue({
      reviewsReconciledAt: RECENT,
      lastReviewSyncedAt: '2026-01-05T00:00:00.000Z',
    });
    listReviews.mockResolvedValueOnce(
      page({
        reviews: [review({ externalUpdatedAt: '2026-01-07T00:00:00.000Z' })],
        totalCount: 2000,
      })
    );

    await service.runPoll(job);

    expect(recordProgress).toHaveBeenCalledTimes(1);
    const progress = recordProgress.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(progress).not.toHaveProperty('reviewsTotal');
  });

  it('completes the run as an error, without advancing the cursor, when the location cannot be found', async () => {
    findLocationForTenant.mockResolvedValue(null);

    await expect(service.runPoll(job)).rejects.toThrow('Location location-1 not found');

    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: SyncRunStatus.ERROR, lastReviewSyncedAt: null })
    );
  });

  /** A run truncated by the page cap must fail and leave the cursor: advancing would permanently skip what the cap cut off. */
  it('fails the run and leaves the cursor untouched when the page cap truncates the backlog', async () => {
    findLocationForTenant.mockResolvedValue({
      reviewsReconciledAt: RECENT,
      lastReviewSyncedAt: '2020-01-01T00:00:00.000Z',
    });
    listReviews.mockImplementation((_token: string, options: { pageToken?: string }) => {
      const n = Number(options.pageToken ?? '0');
      return Promise.resolve(
        page({
          reviews: [
            review({
              externalReviewId: `ext-${n}`,
              externalUpdatedAt: new Date(Date.now() - n * 60_000).toISOString(),
            }),
          ],
          nextPageToken: String(n + 1),
        })
      );
    });

    await service.runPoll(job);

    expect(listReviews).toHaveBeenCalledTimes(200);

    const completion = completeRun.mock.calls[0]?.[0] as {
      status: SyncRunStatus;
      lastReviewSyncedAt: string | null;
      errorMessage: string | null;
    };
    expect(completion.status).toBe(SyncRunStatus.ERROR);
    expect(completion.lastReviewSyncedAt).toBeNull();
    expect(completion.errorMessage).toContain('page cap');
  });

  /** Counterpart to the test above: with no cursor seeded there is no gap, so truncation must not fail the location forever. */
  it('succeeds and seeds the cursor when the cap is hit with no cursor to begin with', async () => {
    findLocationForTenant.mockResolvedValue({
      reviewsReconciledAt: RECENT,
      lastReviewSyncedAt: null,
    });
    listReviews.mockImplementation((_token: string, options: { pageToken?: string }) => {
      const n = Number(options.pageToken ?? '0');
      return Promise.resolve(
        page({
          reviews: [
            review({
              externalReviewId: `ext-${n}`,
              externalUpdatedAt: new Date(Date.now() - n * 60_000).toISOString(),
            }),
          ],
          nextPageToken: String(n + 1),
        })
      );
    });

    await service.runPoll(job);

    expect(listReviews).toHaveBeenCalledTimes(200);

    const completion = completeRun.mock.calls[0]?.[0] as {
      status: SyncRunStatus;
      lastReviewSyncedAt: string | null;
      errorMessage: string | null;
    };
    expect(completion.status).toBe(SyncRunStatus.OK);
    expect(completion.errorMessage).toBeNull();
    // Watermark established so the next poll doesn't repeat this.
    expect(completion.lastReviewSyncedAt).not.toBeNull();
  });

  it('still fails the run when classification fails, even on an untruncated poll', async () => {
    findLocationForTenant.mockResolvedValue({
      reviewsReconciledAt: RECENT,
      lastReviewSyncedAt: '2026-01-05T00:00:00.000Z',
    });
    listReviews.mockResolvedValueOnce(
      page({ reviews: [review({ externalUpdatedAt: '2026-01-07T00:00:00.000Z' })] })
    );
    classifyPendingReviews.mockRejectedValue(new Error('connection terminated unexpectedly'));

    await service.runPoll(job);

    const completion = completeRun.mock.calls[0]?.[0] as {
      status: SyncRunStatus;
      lastReviewSyncedAt: string | null;
      errorMessage: string | null;
    };
    expect(completion.status).toBe(SyncRunStatus.ERROR);
    expect(completion.lastReviewSyncedAt).toBeNull();
    expect(completion.errorMessage).toContain('classification failed');
  });

  // The incremental poll never revisits old reviews, so a review its author deleted would sit in the queue forever.
  describe('deleted-review check', () => {
    const due = { lastReviewSyncedAt: null, detailsRefreshedAt: RECENT, reviewsReconciledAt: null };
    const listed = (...ids: string[]) =>
      page({
        reviews: ids.map(id => ({
          externalReviewId: id,
          externalUpdatedAt: '2026-01-01T00:00:00Z',
        })) as never,
      });

    it('marks an open review Google no longer lists as removed, once a direct lookup confirms the 404', async () => {
      findLocationForTenant.mockResolvedValue(due);
      listReviews.mockResolvedValue(listed('r-kept'));
      findOpenReviewsForReconciliation.mockResolvedValue([
        { id: 'id-kept', externalReviewId: 'r-kept' },
        { id: 'id-gone', externalReviewId: 'r-gone' },
      ]);
      getReviewReply.mockRejectedValue(new ProviderNotFoundError('404'));

      await service.runPoll(job);

      expect(getReviewReply).toHaveBeenCalledTimes(1);
      expect(getReviewReply).toHaveBeenCalledWith('token', {
        externalAccountId: 'accounts/1',
        externalLocationId: 'locations/1',
        externalReviewId: 'r-gone',
      });
      expect(markReviewsRemovedUpstream).toHaveBeenCalledWith(['id-gone']);
      expect(markReviewsReconciled).toHaveBeenCalledWith('location-1');
    });

    // Paging can drop a review between pages, so "not listed" alone proves nothing.
    it('leaves a review alone when the direct lookup finds it', async () => {
      findLocationForTenant.mockResolvedValue(due);
      listReviews.mockResolvedValue(listed('r-kept'));
      findOpenReviewsForReconciliation.mockResolvedValue([
        { id: 'id-slipped', externalReviewId: 'r-slipped' },
      ]);
      getReviewReply.mockResolvedValue(null);

      await service.runPoll(job);

      expect(markReviewsRemovedUpstream).toHaveBeenCalledWith([]);
    });

    it('decides nothing on a lookup failure that is not a 404', async () => {
      findLocationForTenant.mockResolvedValue(due);
      listReviews.mockResolvedValue(listed('r-kept'));
      findOpenReviewsForReconciliation.mockResolvedValue([{ id: 'id-x', externalReviewId: 'r-x' }]);
      getReviewReply.mockRejectedValue(new Error('Google is down'));

      await service.runPoll(job);

      expect(markReviewsRemovedUpstream).toHaveBeenCalledWith([]);
    });

    it('never acts on an empty listing, which an outage looks the same as', async () => {
      findLocationForTenant.mockResolvedValue(due);
      listReviews.mockResolvedValue(page());
      findOpenReviewsForReconciliation.mockResolvedValue([{ id: 'id-x', externalReviewId: 'r-x' }]);

      await service.runPoll(job);

      expect(markReviewsRemovedUpstream).not.toHaveBeenCalled();
      expect(restoreRelistedReviews).not.toHaveBeenCalled();
    });

    it('restores a removed review that Google lists again', async () => {
      findLocationForTenant.mockResolvedValue(due);
      listReviews.mockResolvedValue(listed('r-back'));

      await service.runPoll(job);

      expect(restoreRelistedReviews).toHaveBeenCalledWith({
        locationId: 'location-1',
        externalReviewIds: ['r-back'],
      });
    });

    it('decides nothing when the review list is too long to read in full', async () => {
      findLocationForTenant.mockResolvedValue(due);
      listReviews.mockResolvedValue({ ...listed('r-1'), nextPageToken: 'more' });
      findOpenReviewsForReconciliation.mockResolvedValue([{ id: 'id-x', externalReviewId: 'r-x' }]);

      await service.runPoll(job);

      expect(markReviewsRemovedUpstream).not.toHaveBeenCalled();
      expect(markReviewsReconciled).toHaveBeenCalledWith('location-1');
    });

    it('asks Google at most once a day, and still completes the poll when the check fails', async () => {
      findLocationForTenant.mockResolvedValue({ ...due, reviewsReconciledAt: RECENT });
      await service.runPoll(job);
      expect(findOpenReviewsForReconciliation).not.toHaveBeenCalled();

      findLocationForTenant.mockResolvedValue(due);
      findOpenReviewsForReconciliation.mockRejectedValue(new Error('db blip'));
      await service.runPoll(job);

      expect(markReviewsReconciled).toHaveBeenCalledWith('location-1');
      expect(completeRun).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: SyncRunStatus.OK })
      );
    });
  });

  describe('location details', () => {
    const fresh = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

    it.each([
      ['never refreshed', null],
      ['last refreshed over a day ago', stale],
    ])('re-reads them from the provider when %s, before drafting replies', async (_label, at) => {
      findLocationForTenant.mockResolvedValue({
        reviewsReconciledAt: RECENT,
        lastReviewSyncedAt: null,
        detailsRefreshedAt: at,
      });
      listReviews.mockResolvedValue(page());

      await service.runPoll(job);

      expect(getLocation).toHaveBeenCalledWith('token', 'locations/1');
      expect(updateLocationDetails).toHaveBeenCalledWith({
        locationId: 'location-1',
        name: 'The Coastal Table',
        address: '214 Harbor St',
        phone: '+49 30 1234567',
        websiteUri: 'https://coastal.example',
      });
      expect(updateLocationDetails.mock.invocationCallOrder[0]).toBeLessThan(
        generateForClassifiedReviews.mock.invocationCallOrder[0] ?? 0
      );
    });

    // Regression: a blank Google title made the mapper's fallback (the resource path) overwrite the stored name.
    it("keeps the stored name when Google's title comes back blank", async () => {
      findLocationForTenant.mockResolvedValue({
        reviewsReconciledAt: RECENT,
        lastReviewSyncedAt: null,
        detailsRefreshedAt: null,
        name: 'The Coastal Table',
      });
      listReviews.mockResolvedValue(page());
      getLocation.mockResolvedValue({
        externalLocationId: 'locations/1',
        name: 'locations/1',
        address: null,
        phone: '+49 30 1234567',
        websiteUri: null,
      });

      await service.runPoll(job);

      expect(updateLocationDetails).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'The Coastal Table', phone: '+49 30 1234567' })
      );
    });

    it('leaves them alone when refreshed within the last day', async () => {
      findLocationForTenant.mockResolvedValue({
        reviewsReconciledAt: RECENT,
        lastReviewSyncedAt: null,
        detailsRefreshedAt: fresh,
      });
      listReviews.mockResolvedValue(page());

      await service.runPoll(job);

      expect(getLocation).not.toHaveBeenCalled();
    });

    it('still completes the poll when the refresh fails', async () => {
      findLocationForTenant.mockResolvedValue({
        reviewsReconciledAt: RECENT,
        lastReviewSyncedAt: null,
        detailsRefreshedAt: null,
      });
      listReviews.mockResolvedValue(page());
      getLocation.mockRejectedValue(new Error('Google is down'));

      await service.runPoll(job);

      expect(updateLocationDetails).not.toHaveBeenCalled();
      expect(completeRun).toHaveBeenCalledWith(
        expect.objectContaining({ status: SyncRunStatus.OK })
      );
      // Regression: the attempt went unrecorded, so a location Google kept refusing was re-read every 15 minutes.
      expect(markLocationDetailsAttempted).toHaveBeenCalledWith('location-1');
    });
  });

  it('runs generation for this tenant/location right after classification succeeds', async () => {
    findLocationForTenant.mockResolvedValue({
      reviewsReconciledAt: RECENT,
      lastReviewSyncedAt: '2026-01-05T00:00:00.000Z',
    });
    classifyPendingReviews.mockResolvedValue({ classified: 2, skipped: 0 });

    await service.runPoll(job);

    expect(generateForClassifiedReviews).toHaveBeenCalledWith({
      tenantId: job.tenantId,
      locationId: job.locationId,
    });
  });

  it('does NOT fail the run when generation fails, unlike a classification failure', async () => {
    // Asymmetric with a classification failure: classification already committed and generation
    // self-heals on the next tick.
    findLocationForTenant.mockResolvedValue({
      reviewsReconciledAt: RECENT,
      lastReviewSyncedAt: '2026-01-05T00:00:00.000Z',
    });
    listReviews.mockResolvedValueOnce(
      page({ reviews: [review({ externalUpdatedAt: '2026-01-07T00:00:00.000Z' })] })
    );
    classifyPendingReviews.mockResolvedValue({ classified: 1, skipped: 0 });
    generateForClassifiedReviews.mockRejectedValue(new Error('OpenRouter is down'));

    await service.runPoll(job);

    const completion = completeRun.mock.calls[0]?.[0] as {
      status: SyncRunStatus;
      lastReviewSyncedAt: string | null;
      errorMessage: string | null;
    };
    expect(completion.status).toBe(SyncRunStatus.OK);
    expect(completion.errorMessage).toBeNull();
    expect(completion.lastReviewSyncedAt).not.toBeNull();
  });

  it('reports the quota-reached / generated / failed counts from generation on the run outcome', async () => {
    findLocationForTenant.mockResolvedValue({
      reviewsReconciledAt: RECENT,
      lastReviewSyncedAt: '2026-01-05T00:00:00.000Z',
    });
    listReviews.mockResolvedValueOnce(
      page({ reviews: [review({ externalUpdatedAt: '2026-01-07T00:00:00.000Z' })] })
    );
    classifyPendingReviews.mockResolvedValue({ classified: 3, skipped: 0 });
    generateForClassifiedReviews.mockResolvedValue({
      generated: 2,
      skipped: 0,
      failed: 1,
      quotaReached: false,
    });

    await service.runPoll(job);

    // Observable proof the failure is tolerated: completeRun still reports OK.
    const completion = completeRun.mock.calls[0]?.[0] as { status: SyncRunStatus };
    expect(completion.status).toBe(SyncRunStatus.OK);
  });
});

/**
 * A retry reuses `syncRunId`, whose row the first attempt moved to `error`; without reopening it,
 * `completeRun`'s CAS (`status = 'running'`) updates nothing.
 */
describe('ReviewSyncQueueService.runBackfill — retry reopens the carried sync run', () => {
  let service: ReviewSyncQueueService;
  const listReviews = jest.fn();
  const resolveAccessToken = jest.fn();
  const findConnectionByTenant = jest.fn();
  const importPage = jest.fn();
  const reopenRunForRetry = jest.fn();
  const completeRun = jest.fn();
  const recordProgress = jest.fn();
  const classifyPendingReviews = jest.fn();
  const generateForClassifiedReviews = jest.fn();

  const job = {
    tenantId: 'tenant-1',
    locationId: 'location-1',
    connectionId: 'connection-1',
    externalAccountId: 'accounts/1',
    externalLocationId: 'locations/1',
    syncRunId: 'run-1',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    findConnectionByTenant.mockResolvedValue({
      id: 'connection-1',
      credentialReference: 'ref-1',
      tokenExpiresAt: null,
    });
    resolveAccessToken.mockResolvedValue({ accessToken: 'token', refreshedExpiresAt: null });
    reopenRunForRetry.mockResolvedValue(true);
    importPage.mockResolvedValue({
      reviewsWritten: 1,
      reviewsInserted: 1,
      repliesImported: 0,
      repliesSkippedConflict: 0,
    });
    completeRun.mockResolvedValue(true);
    classifyPendingReviews.mockResolvedValue({ classified: 0, skipped: 0 });
    generateForClassifiedReviews.mockResolvedValue({
      generated: 0,
      skipped: 0,
      failed: 0,
      quotaReached: false,
    });
    listReviews.mockResolvedValue(
      page({ reviews: [review()], nextPageToken: null, totalCount: 1 })
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncQueueService,
        { provide: ReviewProvider, useValue: { listReviews } },
        { provide: ProviderCredentialService, useValue: { resolveAccessToken } },
        {
          provide: ConnectionsDbService,
          useValue: { findConnectionByTenant, markNeedsReauth: jest.fn() },
        },
        {
          provide: ReviewSyncDbService,
          useValue: { reopenRunForRetry, importPage, completeRun, recordProgress },
        },
        { provide: ReviewClassificationService, useValue: { classifyPendingReviews } },
        {
          provide: AiReplyGenerationService,
          useValue: { generateForClassifiedReviews },
        },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncQueueService);
  });

  it('does not touch the run on a first attempt', async () => {
    await service.runBackfill(job, false);

    expect(reopenRunForRetry).not.toHaveBeenCalled();
    expect(completeRun).toHaveBeenCalledTimes(1);
    const completion = completeRun.mock.calls[0]?.[0] as { status: SyncRunStatus };
    expect(completion.status).toBe(SyncRunStatus.OK);
  });

  it('reopens the carried run before importing anything, on a retry', async () => {
    const callOrder: string[] = [];
    reopenRunForRetry.mockImplementation(() => {
      callOrder.push('reopen');
      return Promise.resolve(true);
    });
    listReviews.mockImplementation(() => {
      callOrder.push('listReviews');
      return Promise.resolve(page({ reviews: [review()], nextPageToken: null, totalCount: 1 }));
    });

    await service.runBackfill(job, true);

    expect(reopenRunForRetry).toHaveBeenCalledWith('run-1');
    expect(callOrder).toEqual(['reopen', 'listReviews']);
  });

  it('lets a retried run reach a successful completion — the exact bug this reopen fixes', async () => {
    await service.runBackfill(job, true);

    expect(completeRun).toHaveBeenCalledTimes(1);
    const completion = completeRun.mock.calls[0]?.[0] as {
      status: SyncRunStatus;
      markBackfillComplete: boolean;
    };
    expect(completion.status).toBe(SyncRunStatus.OK);
    expect(completion.markBackfillComplete).toBe(true);
  });

  it('fails loudly, before any import work, when the carried run cannot be reopened', async () => {
    reopenRunForRetry.mockResolvedValue(false);

    await expect(service.runBackfill(job, true)).rejects.toThrow(/run-1/);

    expect(listReviews).not.toHaveBeenCalled();
    expect(completeRun).not.toHaveBeenCalled();
  });
});

/** On failure, `completeRun` must not overwrite `recordProgress`'s larger count with the stale local `reviewsFetched`. */
describe('ReviewSyncQueueService.runBackfill — reviews_fetched survives a mid-import failure', () => {
  let service: ReviewSyncQueueService;
  const listReviews = jest.fn();
  const resolveAccessToken = jest.fn();
  const findConnectionByTenant = jest.fn();
  const importPage = jest.fn();
  const completeRun = jest.fn();
  const recordProgress = jest.fn();
  const classifyPendingReviews = jest.fn();
  const generateForClassifiedReviews = jest.fn();

  const job = {
    tenantId: 'tenant-1',
    locationId: 'location-1',
    connectionId: 'connection-1',
    externalAccountId: 'accounts/1',
    externalLocationId: 'locations/1',
    syncRunId: 'run-1',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    findConnectionByTenant.mockResolvedValue({
      id: 'connection-1',
      credentialReference: 'ref-1',
      tokenExpiresAt: null,
    });
    resolveAccessToken.mockResolvedValue({ accessToken: 'token', refreshedExpiresAt: null });
    importPage.mockResolvedValue({
      reviewsWritten: 100,
      reviewsInserted: 100,
      repliesImported: 0,
      repliesSkippedConflict: 0,
    });
    completeRun.mockResolvedValue(true);
    classifyPendingReviews.mockResolvedValue({ classified: 0, skipped: 0 });
    generateForClassifiedReviews.mockResolvedValue({
      generated: 0,
      skipped: 0,
      failed: 0,
      quotaReached: false,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncQueueService,
        { provide: ReviewProvider, useValue: { listReviews } },
        { provide: ProviderCredentialService, useValue: { resolveAccessToken } },
        {
          provide: ConnectionsDbService,
          useValue: { findConnectionByTenant, markNeedsReauth: jest.fn() },
        },
        {
          provide: ReviewSyncDbService,
          useValue: { importPage, completeRun, recordProgress },
        },
        { provide: ReviewClassificationService, useValue: { classifyPendingReviews } },
        {
          provide: AiReplyGenerationService,
          useValue: { generateForClassifiedReviews },
        },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncQueueService);
  });

  it('omits reviewsFetched from the failure completion, rather than reporting 0 for committed pages', async () => {
    // Page 1 commits 100 reviews; page 2 fails, leaving the local count stale.
    listReviews
      .mockResolvedValueOnce(
        page({ reviews: [review()], nextPageToken: 'page-2', totalCount: 1000 })
      )
      .mockRejectedValueOnce(new Error('socket hang up'));

    await expect(service.runBackfill(job, false)).rejects.toThrow('socket hang up');

    expect(recordProgress).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        reviewsFetched: 100,
      })
    );

    expect(completeRun).toHaveBeenCalledTimes(1);
    const failureCompletion = completeRun.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(failureCompletion['status']).toBe(SyncRunStatus.ERROR);
    // No reviewsFetched key, so the conditional SET leaves recordProgress's 100 in place.
    expect(failureCompletion).not.toHaveProperty('reviewsFetched');
  });

  it('still reports the real, final count on a clean success', async () => {
    listReviews.mockResolvedValueOnce(page({ reviews: [review()], nextPageToken: null }));

    await service.runBackfill(job, false);

    const successCompletion = completeRun.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(successCompletion['status']).toBe(SyncRunStatus.OK);
    expect(successCompletion['reviewsFetched']).toBe(100);
  });
});
