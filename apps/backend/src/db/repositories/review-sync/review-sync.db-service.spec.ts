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
  const markRespondedByExternalReply = jest.fn();
  // `tx.transaction` is the savepoint the reply insert runs in.
  const fakeTx: { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> } = {
    transaction: fn => fn(fakeTx),
  };
  const transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx));

  beforeEach(async () => {
    jest.clearAllMocks();
    upsertReview.mockResolvedValue({ id: 'review-1', inserted: true });
    insertImportedReply.mockResolvedValue(true);
    markRespondedByExternalReply.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        {
          provide: ReviewSyncRepository,
          useValue: {
            transaction,
            upsertReview,
            insertImportedReply,
            markRespondedByExternalReply,
          },
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
  const markRespondedByExternalReply = jest.fn();
  // `tx.transaction` is the savepoint the reply insert runs in.
  const fakeTx: { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> } = {
    transaction: fn => fn(fakeTx),
  };
  const transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx));

  beforeEach(async () => {
    jest.clearAllMocks();
    upsertReview.mockResolvedValue({ id: 'review-1', inserted: true });
    insertImportedReply.mockResolvedValue(true);
    markRespondedByExternalReply.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        {
          provide: ReviewSyncRepository,
          useValue: {
            transaction,
            upsertReview,
            insertImportedReply,
            markRespondedByExternalReply,
          },
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

  it("writes an unreplied review as 'new' no matter how old it is — no age-based dismissal", async () => {
    await service.importPollPage({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      reviews: [pollReview('ext-very-old-unreplied', { reviewedAt: daysAgo(400) })],
    });

    expect((upsertReview.mock.calls[0]?.[1] as { status: string }).status).toBe(ReviewStatus.NEW);
  });

  // Regression: a live poll produced rows with `status='new'` and a `posted` imported reply at once.
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

  // A review first sighted unreplied, answered on Google afterwards: the next poll sees the reply, and the review must close.
  describe('an owner reply made on Google after the review was imported', () => {
    const replied = (): ReturnType<typeof pollReview> =>
      pollReview('ext-1', { reply: { comment: 'Thanks!', updatedAt: new Date().toISOString() } });

    it('closes the review and supersedes its open drafts, once the reply is stored', async () => {
      await service.importPollPage({
        tenantId: 'tenant-1',
        locationId: 'location-1',
        reviews: [replied()],
      });

      expect(markRespondedByExternalReply).toHaveBeenCalledWith(fakeTx, 'review-1');
    });

    it('does so on a later poll too, when the reply was already imported', async () => {
      insertImportedReply.mockResolvedValue(false);

      await service.importPollPage({
        tenantId: 'tenant-1',
        locationId: 'location-1',
        reviews: [replied()],
      });

      expect(markRespondedByExternalReply).toHaveBeenCalledWith(fakeTx, 'review-1');
    });

    it('leaves a review alone when Google has no reply for it', async () => {
      await service.importPollPage({
        tenantId: 'tenant-1',
        locationId: 'location-1',
        reviews: [pollReview('ext-1')],
      });

      expect(markRespondedByExternalReply).not.toHaveBeenCalled();
    });

    // An approved or posted reply of ours is already in flight: the post worker's own freshness check settles it.
    it('does not close the review when our own live reply conflicts with the imported one', async () => {
      insertImportedReply.mockRejectedValue(
        Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'idx_review_responses_review_id_live_reply',
        })
      );

      await service.importPollPage({
        tenantId: 'tenant-1',
        locationId: 'location-1',
        reviews: [replied()],
      });

      expect(markRespondedByExternalReply).not.toHaveBeenCalled();
    });
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

describe('ReviewSyncDbService.reopenRunForRetry', () => {
  let service: ReviewSyncDbService;
  const reopenSyncRunForRetry = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: { reopenSyncRunForRetry } },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('returns true when the row was reopened', async () => {
    reopenSyncRunForRetry.mockResolvedValue(true);

    await expect(service.reopenRunForRetry('run-1')).resolves.toBe(true);
  });

  it('returns false, not a thrown error, when reopening the row loses the same unique-index race acquireSyncRun guards', async () => {
    // A concurrent poll/backfill can hold `running` on the index; this must be a benign `false`, not a raw 23505.
    reopenSyncRunForRetry.mockRejectedValue({
      code: '23505',
      constraint: 'idx_sync_runs_location_id_running',
    });

    await expect(service.reopenRunForRetry('run-1')).resolves.toBe(false);
  });

  it('rethrows any other error', async () => {
    reopenSyncRunForRetry.mockRejectedValue(new Error('connection terminated unexpectedly'));

    await expect(service.reopenRunForRetry('run-1')).rejects.toThrow(
      'connection terminated unexpectedly'
    );
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

  // Backfill stops early by design, so without finalizing, `reviews_total` (lifetime count) never reaches 100%.
  it('finalizes reviewsTotal to the actual count on a completed backfill', async () => {
    await service.completeRun({
      syncRunId: 'run-1',
      locationId: 'location-1',
      status: SyncRunStatus.OK,
      reviewsFetched: 60,
      errorMessage: null,
      markBackfillComplete: true,
      lastReviewSyncedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(completeSyncRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ finalizeReviewsTotal: true, reviewsFetched: 60 })
    );
  });

  it('does not finalize reviewsTotal when the run succeeded but classification failed (markBackfillComplete: false)', async () => {
    await service.completeRun({
      syncRunId: 'run-1',
      locationId: 'location-1',
      status: SyncRunStatus.OK,
      reviewsFetched: 60,
      errorMessage: null,
      markBackfillComplete: false,
      lastReviewSyncedAt: null,
    });

    expect(completeSyncRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ finalizeReviewsTotal: false })
    );
  });

  it('does not finalize reviewsTotal on a failed run', async () => {
    await service.completeRun({
      syncRunId: 'run-1',
      locationId: 'location-1',
      status: SyncRunStatus.ERROR,
      errorMessage: 'boom',
      markBackfillComplete: false,
      lastReviewSyncedAt: null,
    });

    expect(completeSyncRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ finalizeReviewsTotal: false })
    );
  });
});

describe('ReviewSyncDbService.findReviewForTenant', () => {
  let service: ReviewSyncDbService;
  const findReviewByIdForTenant = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: {} },
        { provide: ReviewsReadRepository, useValue: { findReviewByIdForTenant } },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('passes the reviewId/tenantId pair through as a single named input', async () => {
    findReviewByIdForTenant.mockResolvedValue(null);

    await service.findReviewForTenant({ reviewId: 'review-1', tenantId: 'tenant-1' });

    expect(findReviewByIdForTenant).toHaveBeenCalledWith({
      reviewId: 'review-1',
      tenantId: 'tenant-1',
    });
  });
});

describe('ReviewSyncDbService.findResponsesForReviews', () => {
  let service: ReviewSyncDbService;
  const findResponsesForReviews = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: {} },
        { provide: ReviewsReadRepository, useValue: { findResponsesForReviews } },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('passes the reviewIds/tenantId pair through as a single named input', async () => {
    findResponsesForReviews.mockResolvedValue([]);

    await service.findResponsesForReviews({ reviewIds: ['review-1'], tenantId: 'tenant-1' });

    expect(findResponsesForReviews).toHaveBeenCalledWith({
      reviewIds: ['review-1'],
      tenantId: 'tenant-1',
    });
  });
});

describe('ReviewSyncDbService.findResponseForTenant', () => {
  let service: ReviewSyncDbService;
  const findResponseForTenant = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: {} },
        { provide: ReviewsReadRepository, useValue: { findResponseForTenant } },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('passes the responseId/reviewId/tenantId triple through as a single named input', async () => {
    findResponseForTenant.mockResolvedValue(null);

    await service.findResponseForTenant({
      responseId: 'response-1',
      reviewId: 'review-1',
      tenantId: 'tenant-1',
    });

    expect(findResponseForTenant).toHaveBeenCalledWith({
      responseId: 'response-1',
      reviewId: 'review-1',
      tenantId: 'tenant-1',
    });
  });
});

describe('ReviewSyncDbService.approveResponse', () => {
  let service: ReviewSyncDbService;
  const approveResponse = jest.fn();
  const supersedeSiblingDrafts = jest.fn();
  const transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({}));

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        {
          provide: ReviewSyncRepository,
          useValue: { transaction, approveResponse, supersedeSiblingDrafts },
        },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  const input = {
    responseId: 'response-1',
    reviewId: 'review-1',
    tenantId: 'tenant-1',
    approvedByUserId: 'user-1',
    content: 'Thanks!',
    source: 'ai_generated',
  } as Parameters<typeof service.approveResponse>[0];

  it('supersedes every other pending sibling in the same transaction after a successful approval', async () => {
    const approved = { id: 'response-1', generationGroupId: 'group-1' };
    approveResponse.mockResolvedValue(approved);

    const result = await service.approveResponse(input);

    expect(supersedeSiblingDrafts).toHaveBeenCalledWith(expect.anything(), {
      reviewId: 'review-1',
      excludeResponseId: 'response-1',
    });
    expect(result).toBe(approved);
  });

  it('does not supersede anything and returns null when the CAS finds nothing pending', async () => {
    approveResponse.mockResolvedValue(null);

    const result = await service.approveResponse(input);

    expect(supersedeSiblingDrafts).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('propagates a unique-violation error uncaught, for the service layer to translate', async () => {
    const conflict = { code: '23505', constraint: 'idx_review_responses_review_id_live_reply' };
    approveResponse.mockRejectedValue(conflict);

    await expect(service.approveResponse(input)).rejects.toBe(conflict);
    expect(supersedeSiblingDrafts).not.toHaveBeenCalled();
  });
});

describe('ReviewSyncDbService.rejectResponse', () => {
  let service: ReviewSyncDbService;
  const rejectResponse = jest.fn();
  const transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({}));

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: { transaction, rejectResponse } },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('passes the input straight through inside a transaction', async () => {
    const rejected = { id: 'response-1' };
    rejectResponse.mockResolvedValue(rejected);

    const result = await service.rejectResponse({
      responseId: 'response-1',
      reviewId: 'review-1',
      tenantId: 'tenant-1',
      rejectedByUserId: 'user-1',
    });

    expect(rejectResponse).toHaveBeenCalledWith(expect.anything(), {
      responseId: 'response-1',
      reviewId: 'review-1',
      tenantId: 'tenant-1',
      rejectedByUserId: 'user-1',
    });
    expect(result).toBe(rejected);
  });
});

describe('ReviewSyncDbService.claimResponseForPosting', () => {
  let service: ReviewSyncDbService;
  const claimResponseForPosting = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: { claimResponseForPosting } },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('passes the input straight through to the repository', async () => {
    const claimed = { id: 'response-1', status: 'approved' };
    claimResponseForPosting.mockResolvedValue(claimed);

    const result = await service.claimResponseForPosting({
      responseId: 'response-1',
      tenantId: 'tenant-1',
    });

    expect(claimResponseForPosting).toHaveBeenCalledWith({
      responseId: 'response-1',
      tenantId: 'tenant-1',
    });
    expect(result).toBe(claimed);
  });
});

describe('ReviewSyncDbService.markResponsePosted', () => {
  let service: ReviewSyncDbService;
  const markResponsePosted = jest.fn();
  const transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({}));

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: { transaction, markResponsePosted } },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('runs inside a transaction and passes the input straight through', async () => {
    const posted = { id: 'response-1', status: 'posted' };
    markResponsePosted.mockResolvedValue(posted);

    const result = await service.markResponsePosted({
      responseId: 'response-1',
      reviewId: 'review-1',
      postedAt: '2026-03-12T09:01:11.402Z',
    });

    expect(markResponsePosted).toHaveBeenCalledWith(expect.anything(), {
      responseId: 'response-1',
      reviewId: 'review-1',
      postedAt: '2026-03-12T09:01:11.402Z',
    });
    expect(result).toBe(posted);
  });
});

describe('ReviewSyncDbService.markResponsePostFailed', () => {
  let service: ReviewSyncDbService;
  const markResponsePostFailed = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: { markResponsePostFailed } },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('passes the input straight through to the repository', async () => {
    const failed = { id: 'response-1', status: 'post_failed' };
    markResponsePostFailed.mockResolvedValue(failed);

    const result = await service.markResponsePostFailed({
      responseId: 'response-1',
      errorMessage: 'Google API returned 429',
    });

    expect(markResponsePostFailed).toHaveBeenCalledWith({
      responseId: 'response-1',
      errorMessage: 'Google API returned 429',
    });
    expect(result).toBe(failed);
  });
});

describe('ReviewSyncDbService.supersedeForExternalReply', () => {
  let service: ReviewSyncDbService;
  const supersedeForExternalReply = jest.fn();
  const transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({}));

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: { transaction, supersedeForExternalReply } },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('runs inside a transaction and passes the input straight through', async () => {
    supersedeForExternalReply.mockResolvedValue(true);

    const result = await service.supersedeForExternalReply({
      responseId: 'response-1',
      reviewId: 'review-1',
      tenantId: 'tenant-1',
      content: "Thanks, we're glad you enjoyed it!",
      postedAt: '2026-03-12T09:01:11.402Z',
    });

    expect(supersedeForExternalReply).toHaveBeenCalledWith(expect.anything(), {
      responseId: 'response-1',
      reviewId: 'review-1',
      tenantId: 'tenant-1',
      content: "Thanks, we're glad you enjoyed it!",
      postedAt: '2026-03-12T09:01:11.402Z',
    });
    expect(result).toBe(true);
  });

  it('reports false, unchanged, when the CAS found nothing to supersede', async () => {
    supersedeForExternalReply.mockResolvedValue(false);

    const result = await service.supersedeForExternalReply({
      responseId: 'response-1',
      reviewId: 'review-1',
      tenantId: 'tenant-1',
      content: 'Someone else replied.',
      postedAt: '2026-03-12T09:01:11.402Z',
    });

    expect(result).toBe(false);
  });
});

describe('ReviewSyncDbService.retryPostableResponse', () => {
  let service: ReviewSyncDbService;
  const retryPostableResponse = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: { retryPostableResponse } },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('passes the input straight through to the repository', async () => {
    const retried = { id: 'response-1', status: 'approved' };
    retryPostableResponse.mockResolvedValue(retried);

    const result = await service.retryPostableResponse({
      responseId: 'response-1',
      tenantId: 'tenant-1',
    });

    expect(retryPostableResponse).toHaveBeenCalledWith({
      responseId: 'response-1',
      tenantId: 'tenant-1',
    });
    expect(result).toBe(retried);
  });
});

describe('ReviewSyncDbService.insertManualReply', () => {
  let service: ReviewSyncDbService;
  const insertManualReply = jest.fn();
  const supersedeSiblingDrafts = jest.fn();
  const transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({}));

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        {
          provide: ReviewSyncRepository,
          useValue: { transaction, insertManualReply, supersedeSiblingDrafts },
        },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ReviewSyncDbService);
  });

  it('inserts the reply then supersedes non-terminal siblings in the same transaction', async () => {
    const inserted = { id: 'response-2', reviewId: 'review-1' };
    insertManualReply.mockResolvedValue(inserted);
    supersedeSiblingDrafts.mockResolvedValue(['response-1']);

    const result = await service.insertManualReply({
      tenantId: 'tenant-1',
      reviewId: 'review-1',
      responseType: 'escalation_snippet',
      content: 'A manual reply.',
      createdByUserId: 'user-1',
    } as Parameters<typeof service.insertManualReply>[0]);

    expect(insertManualReply).toHaveBeenCalledWith(expect.anything(), {
      tenantId: 'tenant-1',
      reviewId: 'review-1',
      responseType: 'escalation_snippet',
      content: 'A manual reply.',
      createdByUserId: 'user-1',
    });
    expect(supersedeSiblingDrafts).toHaveBeenCalledWith(expect.anything(), {
      reviewId: 'review-1',
      excludeResponseId: 'response-2',
    });
    expect(result).toEqual({ response: inserted, supersededResponseIds: ['response-1'] });
  });
});

describe('ReviewSyncDbService.releaseResponseClaim', () => {
  it('delegates to the repository with the same input', async () => {
    const releaseResponseClaim = jest.fn().mockResolvedValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        { provide: ReviewSyncRepository, useValue: { releaseResponseClaim } },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();

    const result = await moduleRef
      .get(ReviewSyncDbService)
      .releaseResponseClaim({ responseId: 'response-1', tenantId: 'tenant-1' });

    expect(result).toBe(true);
    expect(releaseResponseClaim).toHaveBeenCalledWith({
      responseId: 'response-1',
      tenantId: 'tenant-1',
    });
  });
});

describe('ReviewSyncDbService.importLiveReply', () => {
  const input = {
    tenantId: 'tenant-1',
    reviewId: 'review-1',
    content: 'Live on Google.',
    postedAt: '2026-03-12T10:00:00.000Z',
  };
  const tx = { __tx: true };
  const insertImportedReply = jest.fn();
  const markReviewResponded = jest.fn();
  const transaction = jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx));
  let service: ReviewSyncDbService;

  beforeEach(async () => {
    jest.clearAllMocks();
    insertImportedReply.mockResolvedValue(true);
    markReviewResponded.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewSyncDbService,
        {
          provide: ReviewSyncRepository,
          useValue: { transaction, insertImportedReply, markReviewResponded },
        },
        { provide: ReviewsReadRepository, useValue: {} },
        { provide: ConnectionsRepository, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ReviewSyncDbService);
  });

  it('imports the live reply and advances the review to responded in one transaction', async () => {
    await expect(service.importLiveReply(input)).resolves.toBe(true);

    expect(insertImportedReply).toHaveBeenCalledWith(tx, input);
    expect(markReviewResponded).toHaveBeenCalledWith(tx, 'review-1');
  });

  it('returns false instead of throwing when the review already has a live reply on record', async () => {
    transaction.mockRejectedValueOnce(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'idx_review_responses_review_id_live_reply',
      })
    );

    await expect(service.importLiveReply(input)).resolves.toBe(false);
  });

  it('rethrows any other failure', async () => {
    transaction.mockRejectedValueOnce(new Error('db down'));

    await expect(service.importLiveReply(input)).rejects.toThrow('db down');
  });
});
