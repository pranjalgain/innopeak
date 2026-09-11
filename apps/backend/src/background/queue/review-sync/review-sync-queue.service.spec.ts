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
  it('stops paginating once a review is found well before the cursor, without fetching further pages', async () => {
    findLocationForTenant.mockResolvedValue({ lastReviewSyncedAt: '2026-01-05T00:00:00.000Z' });
    listReviews.mockResolvedValueOnce(
      page({
        reviews: [
          review({ externalReviewId: 'ext-new-1', externalUpdatedAt: '2026-01-07T00:00:00.000Z' }),
          review({ externalReviewId: 'ext-new-2', externalUpdatedAt: '2026-01-06T00:00:00.000Z' }),
          // An hour before the cursor — well outside POLL_CURSOR_OVERLAP_MS's 5-minute window, so
          // this is unambiguously old and still stops the walk.
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
   * `POLL_CURSOR_OVERLAP_MS` — Google's `reviews.list` walks a live, mutating list with no
   * documented guarantee that a review's position is stable across the page fetches one poll
   * makes. A review sitting right at the cursor can shift onto the wrong side of this run's
   * boundary due to a concurrent insert/edit elsewhere, and with a single high-water cursor a
   * review skipped that way is gone forever — no later poll ever looks below its own cursor. The
   * fix re-examines a small window before the exact cursor rather than stopping there precisely,
   * so a review in that window is re-imported (idempotently — `upsertReview`'s `ON CONFLICT`
   * never touches `status`) instead of depending on this run's boundary having landed exactly
   * where it would have without the race.
   */
  it('re-examines reviews within the overlap window before the cursor, not just strictly after it', async () => {
    findLocationForTenant.mockResolvedValue({ lastReviewSyncedAt: '2026-01-05T00:00:00.000Z' });
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
    // The cursor advances only as far as the genuinely newest review — re-examining the boundary
    // review must never regress it or push it backwards.
    expect(completeRun).toHaveBeenCalledWith(
      expect.objectContaining({ lastReviewSyncedAt: '2026-01-06T00:00:00.000Z' })
    );
  });

  it('does not re-examine anything when the boundary review is right outside the overlap window', async () => {
    findLocationForTenant.mockResolvedValue({ lastReviewSyncedAt: '2026-01-05T00:00:00.000Z' });
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

  /**
   * `page.totalCount` is Google's *lifetime* review count for the location — a poll only ever
   * fetches what is newer than its cursor, typically a handful of reviews, so writing the lifetime
   * count as this run's `reviewsTotal` turned every poll's row into a meaningless "3 fetched / 2000
   * total" ratio.
   */
  it('never records reviewsTotal on a poll run, even when the provider reports one', async () => {
    findLocationForTenant.mockResolvedValue({ lastReviewSyncedAt: '2026-01-05T00:00:00.000Z' });
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

/**
 * `job.syncRunId` is acquired once, before the job is ever published (`ConnectionsDbService`
 * confirms the location and inserts the `sync_runs` row synchronously in that request). BullMQ's
 * `attempts: 2` means a failed first attempt is retried against that *same* job — same
 * `syncRunId` — not a fresh one. The first attempt's catch block already moved that row to
 * `error`, and `completeRun`'s own CAS only matches `status = 'running'`, so without reopening it
 * a successful retry's completion call silently updates nothing: no `markBackfillCompleted`, no
 * cursor advance, while BullMQ still reports the job completed.
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
    // Before the fix: `completeRun`'s CAS only matches `status = 'running'`. The first attempt's
    // failure already flipped the row to `error`; without reopening it, this call would still be
    // made but would silently update nothing, and the caller had no way to notice.
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

/**
 * `recordProgress` writes the run's cumulative `reviews_fetched` after every page — it is the only
 * place that counter is incremented. The local variable `runBackfill`/`runPoll` hold is only ever
 * assigned once, from the paginator's return value, so a failure partway through paginating never
 * updates it: it is still `0` (or whatever it started at) when the catch block runs, even though
 * real pages already committed real reviews. Passing that stale count to `completeRun` used to
 * overwrite the true, larger number `recordProgress` had already written — turning "700 reviews
 * imported, then a 401 on page 15" into a run whose final row reads 0.
 */
describe('ReviewSyncQueueService.runBackfill — reviews_fetched survives a mid-import failure', () => {
  let service: ReviewSyncQueueService;
  const listReviews = jest.fn();
  const resolveAccessToken = jest.fn();
  const findConnectionByTenant = jest.fn();
  const importPage = jest.fn();
  const completeRun = jest.fn();
  const recordProgress = jest.fn();
  const classifyPendingReviews = jest.fn();

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
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncQueueService);
  });

  it('omits reviewsFetched from the failure completion, rather than reporting 0 for committed pages', async () => {
    // Page 1 succeeds and commits 100 reviews (recordProgress sees reviewsFetched: 100); page 2's
    // request fails outright, so importAllPages throws with the count still sitting in a local
    // scope the catch block never sees.
    listReviews
      .mockResolvedValueOnce(
        page({ reviews: [review()], nextPageToken: 'page-2', totalCount: 1000 })
      )
      .mockRejectedValueOnce(new Error('socket hang up'));

    await expect(service.runBackfill(job, false)).rejects.toThrow('socket hang up');

    // The one durable record of progress during the run.
    expect(recordProgress).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        reviewsFetched: 100,
      })
    );

    expect(completeRun).toHaveBeenCalledTimes(1);
    const failureCompletion = completeRun.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(failureCompletion['status']).toBe(SyncRunStatus.ERROR);
    // The actual assertion: no reviewsFetched key at all, so the repository's conditional SET
    // clause leaves recordProgress's 100 in place instead of clobbering it with a stale count.
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
