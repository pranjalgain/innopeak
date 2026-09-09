import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Test } from '@nestjs/testing';
import { ReviewClassificationService } from '@review-pipeline/review-classification.service';
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
  const resolveAccessToken = jest.fn();
  const findConnectionByTenant = jest.fn();
  const findLocationForTenant = jest.fn();
  const acquireSyncRun = jest.fn();
  const importPollPage = jest.fn();
  const completeRun = jest.fn();
  const recordProgress = jest.fn();
  const classifyPendingReviews = jest.fn();

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

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncQueueService,
        { provide: ReviewProvider, useValue: { listReviews } },
        { provide: ProviderCredentialService, useValue: { resolveAccessToken } },
        {
          provide: ConnectionsDbService,
          useValue: { findConnectionByTenant, findLocationForTenant, markNeedsReauth: jest.fn() },
        },
        {
          provide: ReviewSyncDbService,
          useValue: { acquireSyncRun, importPollPage, completeRun, recordProgress },
        },
        { provide: ReviewClassificationService, useValue: { classifyPendingReviews } },
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

  /**
   * The whole reason `last_review_synced_at` exists: Google orders `updateTime desc`, so the
   * moment a review at or before the cursor appears, everything after it in that page — and every
   * later page — is already known. A regression here either re-walks full history every 15
   * minutes (wasted quota) or stops one page too early (missed reviews).
   */
  it('stops paginating at the first review at or before the cursor, without fetching further pages', async () => {
    findLocationForTenant.mockResolvedValue({ lastReviewSyncedAt: '2026-01-05T00:00:00.000Z' });
    listReviews.mockResolvedValueOnce(
      page({
        reviews: [
          review({ externalReviewId: 'ext-new-1', externalUpdatedAt: '2026-01-07T00:00:00.000Z' }),
          review({ externalReviewId: 'ext-new-2', externalUpdatedAt: '2026-01-06T00:00:00.000Z' }),
          // At the cursor — this and everything after it is already known.
          review({ externalReviewId: 'ext-old-1', externalUpdatedAt: '2026-01-05T00:00:00.000Z' }),
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

  it('walks every page to the cap when the location has never been synced (null cursor)', async () => {
    findLocationForTenant.mockResolvedValue({ lastReviewSyncedAt: null });
    listReviews
      .mockResolvedValueOnce(
        page({ reviews: [review({ externalReviewId: 'ext-1' })], nextPageToken: 'page-2' })
      )
      .mockResolvedValueOnce(page({ reviews: [review({ externalReviewId: 'ext-2' })] }));

    await service.runPoll(job);

    expect(listReviews).toHaveBeenCalledTimes(2);
    expect(importPollPage).toHaveBeenCalledTimes(2);
  });

  it('completes the run as an error, without advancing the cursor, when the location cannot be found', async () => {
    findLocationForTenant.mockResolvedValue(null);

    await expect(service.runPoll(job)).rejects.toThrow('Location location-1 not found');

    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: SyncRunStatus.ERROR, lastReviewSyncedAt: null })
    );
  });

  /**
   * The regression this exists to prevent: Google orders `updateTime desc`, so a run that hits the
   * page cap before reaching the cursor has imported the *newest* slice of a backlog and its
   * `maxExternalUpdatedAt` is the global newest. Advancing the cursor there steps permanently over
   * everything the cap cut off, because no later poll looks below its own cursor. Must fail the
   * run and leave the cursor alone instead.
   */
  it('fails the run and leaves the cursor untouched when the page cap truncates the backlog', async () => {
    findLocationForTenant.mockResolvedValue({ lastReviewSyncedAt: '2020-01-01T00:00:00.000Z' });
    // Every page is full, always has a next page, and never reaches the ancient cursor.
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

    // Bounded by MAX_POLL_PAGES (200) — no infinite pagination.
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

  /**
   * The counterpart to the test above, and the reason `truncated` checks `cursor !== null`.
   * A location that is poll-eligible (backfill completed) but never got a cursor seeded — a
   * backfill that fetched zero reviews, or one predating the column — must not fail forever just
   * because it has more than one poll's worth of reviews. With no prior watermark there is no gap
   * being skipped, so the run succeeds and adopts the newest timestamp as the starting watermark.
   */
  it('succeeds and seeds the cursor when the cap is hit with no cursor to begin with', async () => {
    findLocationForTenant.mockResolvedValue({ lastReviewSyncedAt: null });
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
    // Watermark established, so the next poll starts from here rather than repeating this forever.
    expect(completion.lastReviewSyncedAt).not.toBeNull();
  });

  it('still fails the run when classification fails, even on an untruncated poll', async () => {
    findLocationForTenant.mockResolvedValue({ lastReviewSyncedAt: '2026-01-05T00:00:00.000Z' });
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
});
