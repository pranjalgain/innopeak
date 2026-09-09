import { ReviewStatus } from '@common/enums/review-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { Test } from '@nestjs/testing';

import { ReviewSyncDbService } from './review-sync.db-service';
import { ReviewSyncRepository } from './review-sync.repository';
import { ReviewsReadRepository } from './reviews-read.repository';

import { ConnectionsRepository } from '../connections/connections.repository';

/** Matches BACKFILL_ACTIONABLE_WINDOW_DAYS in review-sync.db-service.ts. */
const WINDOW_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

describe('ReviewSyncDbService.importPage', () => {
  let service: ReviewSyncDbService;
  const upsertReview = jest.fn();
  const insertImportedReply = jest.fn();
  const transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({}));

  beforeEach(async () => {
    jest.clearAllMocks();
    upsertReview.mockResolvedValue({ id: 'review-1', inserted: true });
    insertImportedReply.mockResolvedValue(true);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        {
          provide: ReviewSyncRepository,
          useValue: { transaction, upsertReview, insertImportedReply },
        },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  const baseReview = {
    externalReviewId: 'ext-1',
    externalReviewerId: null,
    reviewerName: 'Ada',
    rating: 5,
    text: 'Lovely',
    externalUpdatedAt: daysAgo(1),
  };

  async function importOne(
    overrides: Partial<Parameters<typeof service.importPage>[0]['reviews'][0]>
  ) {
    await service.importPage({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      reviews: [{ ...baseReview, reviewedAt: daysAgo(1), reply: null, ...overrides }],
    });
    return (upsertReview.mock.calls[0]?.[1] as { status: string } | undefined)?.status;
  }

  /**
   * PLAN.md §7 says every backfilled review gets `status = 'responded'` unconditionally. This
   * repo deviates on that point twice over: an unreplied review isn't `responded` (nothing was
   * answered), and an unreplied *recent* review isn't permanently closed either (it's genuine
   * backlog worth surfacing) — see `resolveBackfillStatus`'s doc comment for the full reasoning.
   */
  describe('a review with an approved public reply', () => {
    it("is 'responded' when recent", async () => {
      const status = await importOne({
        reviewedAt: daysAgo(1),
        reply: { comment: 'Thanks!', updatedAt: daysAgo(1) },
      });
      expect(status).toBe(ReviewStatus.RESPONDED);
    });

    it("is 'responded' even when very old — replied reviews never become 'new'", async () => {
      const status = await importOne({
        reviewedAt: daysAgo(WINDOW_DAYS * 10),
        reply: { comment: 'Thanks!', updatedAt: daysAgo(WINDOW_DAYS * 10) },
      });
      expect(status).toBe(ReviewStatus.RESPONDED);
    });
  });

  describe('a review with no reply (or one Google rejected)', () => {
    it("is 'new' when within the actionable window — real backlog, not dead history", async () => {
      const status = await importOne({ reviewedAt: daysAgo(WINDOW_DAYS - 1), reply: null });
      expect(status).toBe(ReviewStatus.NEW);
    });

    it("is 'dismissed' when older than the actionable window", async () => {
      const status = await importOne({ reviewedAt: daysAgo(WINDOW_DAYS + 1), reply: null });
      expect(status).toBe(ReviewStatus.DISMISSED);
    });
  });

  it('mixes statuses within a single page rather than forcing one outcome for the whole batch', async () => {
    await service.importPage({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      reviews: [
        {
          ...baseReview,
          externalReviewId: 'ext-replied',
          reviewedAt: daysAgo(400),
          reply: { comment: 'Thanks!', updatedAt: daysAgo(400) },
        },
        {
          ...baseReview,
          externalReviewId: 'ext-recent-unreplied',
          reviewedAt: daysAgo(5),
          reply: null,
        },
        {
          ...baseReview,
          externalReviewId: 'ext-old-unreplied',
          reviewedAt: daysAgo(400),
          reply: null,
        },
      ],
    });

    const statusById = new Map(
      upsertReview.mock.calls.map(call => {
        const arg = call[1] as { externalReviewId: string; status: string };
        return [arg.externalReviewId, arg.status];
      })
    );

    expect(statusById.get('ext-replied')).toBe(ReviewStatus.RESPONDED);
    expect(statusById.get('ext-recent-unreplied')).toBe(ReviewStatus.NEW);
    expect(statusById.get('ext-old-unreplied')).toBe(ReviewStatus.DISMISSED);
  });
});

describe('ReviewSyncDbService.importPollPage', () => {
  let service: ReviewSyncDbService;
  const upsertReview = jest.fn();
  const insertImportedReply = jest.fn();
  const transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({}));

  beforeEach(async () => {
    jest.clearAllMocks();
    upsertReview.mockResolvedValue({ id: 'review-1', inserted: true });
    insertImportedReply.mockResolvedValue(true);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        {
          provide: ReviewSyncRepository,
          useValue: { transaction, upsertReview, insertImportedReply },
        },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  const pollReview = (
    externalReviewId: string,
    overrides: Partial<Parameters<typeof service.importPollPage>[0]['reviews'][0]> = {}
  ) => ({
    externalReviewId,
    externalReviewerId: null,
    reviewerName: 'Ada',
    rating: 5,
    text: 'Lovely',
    reviewedAt: daysAgo(400),
    externalUpdatedAt: new Date().toISOString(),
    reply: null,
    ...overrides,
  });

  /**
   * The deliberate difference from `resolveBackfillStatus`: no age-based write-off.
   * `resolveBackfillStatus`'s `dismissed` branch exists for one-time historical import; a review
   * the poller just saw for the first time is live backlog however old it is.
   */
  it("writes an unreplied review as 'new' no matter how old it is — no age-based dismissal", async () => {
    await service.importPollPage({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      reviews: [pollReview('ext-very-old-unreplied', { reviewedAt: daysAgo(400) })],
    });

    expect((upsertReview.mock.calls[0]?.[1] as { status: string }).status).toBe(ReviewStatus.NEW);
  });

  /**
   * Reply presence *is* honoured, unlike an earlier revision that wrote `new` unconditionally.
   * A first-sighted review can legitimately arrive already answered — the owner replied on Google
   * inside one poll interval, or the poller was behind — and `new` there queues a review the owner
   * has already answered for classification and, once generation exists, an AI draft that PLAN.md
   * §8.12 says must never overwrite the owner's own words. Caught by a live poll against real
   * data, which produced rows holding `status='new'` *and* a `posted` imported reply at once.
   */
  it("writes a first-sighted review that already carries the owner's reply as 'responded'", async () => {
    await service.importPollPage({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      reviews: [
        pollReview('ext-arrived-replied', {
          reply: { comment: 'Thanks!', updatedAt: new Date().toISOString() },
        }),
      ],
    });

    expect((upsertReview.mock.calls[0]?.[1] as { status: string }).status).toBe(
      ReviewStatus.RESPONDED
    );
  });

  it('mixes the two within one page rather than forcing one outcome for the batch', async () => {
    await service.importPollPage({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      reviews: [
        pollReview('ext-replied', {
          reply: { comment: 'Thanks!', updatedAt: new Date().toISOString() },
        }),
        pollReview('ext-unreplied'),
      ],
    });

    const statusById = new Map(
      upsertReview.mock.calls.map(call => {
        const arg = call[1] as { externalReviewId: string; status: string };
        return [arg.externalReviewId, arg.status];
      })
    );

    expect(statusById.get('ext-replied')).toBe(ReviewStatus.RESPONDED);
    expect(statusById.get('ext-unreplied')).toBe(ReviewStatus.NEW);
  });
});

describe('ReviewSyncDbService.acquireSyncRun', () => {
  let service: ReviewSyncDbService;
  const transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({}));
  const acquireSyncRun = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: { transaction, acquireSyncRun } },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('returns the acquired run on success', async () => {
    const run = { id: 'run-1', status: SyncRunStatus.RUNNING };
    acquireSyncRun.mockResolvedValue(run);

    const result = await service.acquireSyncRun({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      trigger: SyncTrigger.SCHEDULED,
    });

    expect(result).toBe(run);
  });

  /**
   * PLAN.md §8.1: a second poll finding its own location already mid-run is expected and benign,
   * not a failure — `runPoll` treats `null` as a clean no-op rather than a thrown error a job
   * retry or DLQ entry would be the wrong response to.
   */
  it('returns null, not a thrown error, when a run is already genuinely active for the location', async () => {
    acquireSyncRun.mockRejectedValue({
      code: '23505',
      constraint: 'idx_sync_runs_location_id_running',
    });

    const result = await service.acquireSyncRun({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      trigger: SyncTrigger.SCHEDULED,
    });

    expect(result).toBeNull();
  });

  it('rethrows any other error', async () => {
    acquireSyncRun.mockRejectedValue(new Error('connection terminated unexpectedly'));

    await expect(
      service.acquireSyncRun({
        tenantId: 'tenant-1',
        locationId: 'location-1',
        trigger: SyncTrigger.SCHEDULED,
      })
    ).rejects.toThrow('connection terminated unexpectedly');
  });
});

describe('ReviewSyncDbService.completeRun', () => {
  let service: ReviewSyncDbService;
  const completeSyncRun = jest.fn();
  const updateSyncSnapshot = jest.fn();
  const markBackfillCompleted = jest.fn();
  const advanceLastReviewSyncedAt = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    completeSyncRun.mockResolvedValue(true);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: { completeSyncRun } },
        { provide: ReviewsReadRepository, useValue: {} },
        {
          provide: ConnectionsRepository,
          useValue: { updateSyncSnapshot, markBackfillCompleted, advanceLastReviewSyncedAt },
        },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('advances the cursor on a successful run with a non-null timestamp', async () => {
    await service.completeRun({
      syncRunId: 'run-1',
      locationId: 'location-1',
      status: SyncRunStatus.OK,
      reviewsFetched: 3,
      errorMessage: null,
      markBackfillComplete: false,
      lastReviewSyncedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(advanceLastReviewSyncedAt).toHaveBeenCalledWith(
      'location-1',
      '2026-01-01T00:00:00.000Z'
    );
  });

  it('does not advance the cursor when nothing was fetched (null timestamp)', async () => {
    await service.completeRun({
      syncRunId: 'run-1',
      locationId: 'location-1',
      status: SyncRunStatus.OK,
      reviewsFetched: 0,
      errorMessage: null,
      markBackfillComplete: false,
      lastReviewSyncedAt: null,
    });

    expect(advanceLastReviewSyncedAt).not.toHaveBeenCalled();
  });

  it('does not advance the cursor on a failed run even if a timestamp is somehow provided', async () => {
    await service.completeRun({
      syncRunId: 'run-1',
      locationId: 'location-1',
      status: SyncRunStatus.ERROR,
      reviewsFetched: 3,
      errorMessage: 'boom',
      markBackfillComplete: false,
      lastReviewSyncedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(advanceLastReviewSyncedAt).not.toHaveBeenCalled();
  });

  it('does not advance the cursor when the CAS was lost (run reclaimed as stale)', async () => {
    completeSyncRun.mockResolvedValue(false);

    const stillOwned = await service.completeRun({
      syncRunId: 'run-1',
      locationId: 'location-1',
      status: SyncRunStatus.OK,
      reviewsFetched: 3,
      errorMessage: null,
      markBackfillComplete: false,
      lastReviewSyncedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(stillOwned).toBe(false);
    expect(advanceLastReviewSyncedAt).not.toHaveBeenCalled();
  });
});
