import { ReviewStatus } from '@common/enums/review-status.enum';
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
