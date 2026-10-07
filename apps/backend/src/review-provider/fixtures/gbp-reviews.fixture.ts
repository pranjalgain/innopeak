import type { GbpListReviewsResponse, GbpReview } from '../types/gbp-wire.type';

const LOCATION_PATH = 'accounts/108327761122/locations/12345678901234567890';
const DAY_MS = 24 * 60 * 60 * 1000;

// Relative to load time, not a fixed date: the backfill's recency window (`resolveBackfillStatus`:
// unreplied + recent -> 'new', old -> 'dismissed') would otherwise drift until only 'dismissed' shows.
function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function review(id: string, fields: Omit<GbpReview, 'name'> & { name?: never }): GbpReview {
  return { name: `${LOCATION_PATH}/reviews/${id}`, ...fields };
}

/**
 * Google-wire-shaped on purpose (`starRating: 'FIVE'`, nested `reviewReply`): a row-shaped fixture
 * would bypass `mapGbpReview`/`starRatingToInt` and test the mapper against itself. Edge cases
 * seeded here have each broken a real adapter: `ONE` rating (ptl-006), no `comment` key (ptl-004),
 * no reviewer (ptl-011), a REJECTED reply (ptl-008), a reply predating its review (ptl-009), an
 * edited review (ptl-002).
 */
const PAGE_ONE: GbpReview[] = [
  review('ptl-001', {
    reviewer: { displayName: 'Marta Kowalska', profilePhotoUrl: 'https://example.com/p/mk.jpg' },
    starRating: 'FIVE',
    comment:
      'Best cioppino on the harbour. The broth had real depth and the sourdough they serve with it is clearly made in house. Booked again for next weekend.',
    createTime: '2026-03-11T18:22:04.129Z',
    updateTime: '2026-03-11T18:22:04.129Z',
    reviewReply: {
      comment:
        'Thank you Marta — the cioppino is Chef Ana’s grandmother’s recipe. See you next weekend!',
      updateTime: '2026-03-12T09:01:11.402Z',
      reviewReplyState: 'APPROVED',
    },
  }),
  review('ptl-002', {
    reviewer: { displayName: 'Devon Fairweather' },
    starRating: 'FOUR',
    comment:
      'Great food, slightly cramped seating upstairs. Edited to add: the manager followed up and moved us to a window table on our second visit.',
    createTime: '2026-03-08T20:41:55.000Z',
    updateTime: '2026-03-15T11:02:31.000Z',
    reviewReply: {
      comment:
        'Glad the window table worked out, Devon. We’re looking at the upstairs layout this spring.',
      updateTime: '2026-03-15T14:20:00.000Z',
      reviewReplyState: 'APPROVED',
    },
  }),
  review('ptl-003', {
    reviewer: { displayName: 'Aisha Rahman', profilePhotoUrl: 'https://example.com/p/ar.jpg' },
    starRating: 'FIVE',
    comment:
      'Went for the tasting menu. Every course landed. The scallop dish is worth the trip alone.',
    createTime: '2026-03-02T19:15:00.000Z',
    updateTime: '2026-03-02T19:15:00.000Z',
    reviewReply: {
      comment: 'Thank you Aisha! Those scallops come off a day boat out of Casco Bay.',
      updateTime: '2026-03-03T08:44:19.000Z',
      reviewReplyState: 'APPROVED',
    },
  }),
  review('ptl-004', {
    reviewer: { displayName: 'T. Nakamura' },
    starRating: 'FOUR',
    // No `comment` key: Google omits the field for a rating-only review, it is not "".
    // Recent and unreplied: backfills as 'new', not 'dismissed'.
    createTime: daysAgo(10),
    updateTime: daysAgo(10),
  }),
  review('ptl-005', {
    reviewer: { displayName: 'Colm Byrne' },
    starRating: 'THREE',
    comment:
      'Food was good but we waited 40 minutes past our reservation time on a Tuesday. Nobody checked in with us.',
    createTime: '2026-02-21T18:50:12.000Z',
    updateTime: '2026-02-21T18:50:12.000Z',
    reviewReply: {
      comment:
        'Colm, that wait is on us and it should not have happened on a Tuesday. We have added a host to the early shift.',
      updateTime: '2026-02-22T10:12:00.000Z',
      reviewReplyState: 'APPROVED',
    },
  }),
  review('ptl-006', {
    reviewer: { displayName: 'Bridget Vance' },
    // The value a `?? 0` rating fallback would corrupt.
    starRating: 'ONE',
    comment:
      'Charged twice for the same table and it took three emails to sort out. The food was fine but I will not be back.',
    createTime: '2026-02-14T21:33:07.000Z',
    updateTime: '2026-02-14T21:33:07.000Z',
    reviewReply: {
      comment:
        'Bridget — the double charge was our error and has been refunded. I am sorry it took three emails. Please email me directly if anything is still outstanding.',
      updateTime: '2026-02-15T09:00:00.000Z',
      reviewReplyState: 'APPROVED',
    },
  }),
  review('ptl-007', {
    reviewer: { displayName: 'Yusuf Demir', profilePhotoUrl: 'https://example.com/p/yd.jpg' },
    starRating: 'FIVE',
    comment: 'Took visiting family here twice in one week. That should say enough.',
    createTime: '2026-02-09T17:22:00.000Z',
    updateTime: '2026-02-09T17:22:00.000Z',
  }),
  review('ptl-008', {
    reviewer: { displayName: 'Hannah Wexler' },
    starRating: 'TWO',
    comment: 'Overpriced for the portion sizes. The bread service was the best part of the meal.',
    createTime: '2026-02-03T20:09:44.000Z',
    updateTime: '2026-02-03T20:09:44.000Z',
    reviewReply: {
      comment:
        'Thanks for the honest note, Hannah. We have reworked the portions on two of the mains since February.',
      updateTime: '2026-02-04T12:30:00.000Z',
      // Rejected for a policy violation: not public, so the mapper must drop it rather than import it as `posted`.
      reviewReplyState: 'REJECTED',
    },
  }),
  review('ptl-009', {
    reviewer: { displayName: 'Grant Ellery' },
    starRating: 'FOUR',
    comment: 'Solid lunch. The chowder is the move.',
    createTime: '2026-01-28T13:40:00.000Z',
    updateTime: '2026-01-28T13:40:00.000Z',
    reviewReply: {
      // Earlier than the review's createTime, as in real data (edited reviews keep the reply's updateTime); must not yield a negative response time.
      comment: 'Thanks Grant — the chowder recipe has not changed in nine years.',
      updateTime: '2026-01-27T09:00:00.000Z',
      reviewReplyState: 'APPROVED',
    },
  }),
  review('ptl-010', {
    reviewer: { displayName: 'Priya Raghunathan' },
    starRating: 'FIVE',
    comment: 'Booked the back room for a birthday. Staff went out of their way. Faultless.',
    createTime: '2026-01-19T22:15:33.000Z',
    updateTime: '2026-01-19T22:15:33.000Z',
  }),
  review('ptl-011', {
    // Anonymous: reviewerName must map to null, not crash.
    starRating: 'THREE',
    comment: 'Fine. Nothing wrong with it, nothing memorable either.',
    // Old and unreplied: outside the backfill window, so 'dismissed' (counterpart to ptl-004).
    createTime: daysAgo(400),
    updateTime: daysAgo(400),
  }),
  review('ptl-012', {
    reviewer: { displayName: 'Óscar Ibáñez' },
    starRating: 'FIVE',
    comment: 'El mejor marisco que he comido fuera de España. Volveremos.',
    createTime: '2026-01-04T20:30:00.000Z',
    updateTime: '2026-01-04T20:30:00.000Z',
    reviewReply: {
      comment: '¡Gracias Óscar! Nos alegra mucho. Hasta la próxima.',
      updateTime: '2026-01-05T10:15:00.000Z',
      reviewReplyState: 'APPROVED',
    },
  }),
];

const PAGE_TWO: GbpReview[] = [
  review('ptl-013', {
    reviewer: { displayName: 'Marcus Ostrowski' },
    starRating: 'FOUR',
    comment: 'Consistently good. Been coming since they opened.',
    createTime: '2025-12-22T18:00:00.000Z',
    updateTime: '2025-12-22T18:00:00.000Z',
  }),
  review('ptl-014', {
    reviewer: { displayName: 'Lena Hoffmann', profilePhotoUrl: 'https://example.com/p/lh.jpg' },
    starRating: 'FIVE',
    comment: 'The oyster selection changes weekly and they will actually talk you through it.',
    createTime: '2025-12-14T19:45:00.000Z',
    updateTime: '2025-12-14T19:45:00.000Z',
    reviewReply: {
      comment: 'Thank you Lena — ask for Devi next time, she knows every bed on the list.',
      updateTime: '2025-12-15T11:00:00.000Z',
      reviewReplyState: 'APPROVED',
    },
  }),
  review('ptl-015', {
    reviewer: { displayName: 'Ray Whitfield' },
    starRating: 'TWO',
    comment: 'Reservation was lost. Ended up eating at the bar. Not the welcome we expected.',
    createTime: '2025-12-06T20:20:00.000Z',
    updateTime: '2025-12-06T20:20:00.000Z',
  }),
  review('ptl-016', {
    reviewer: { displayName: 'Anneke de Vries' },
    starRating: 'FIVE',
    comment: 'Worth every penny. The halibut was cooked exactly right.',
    createTime: '2025-11-29T18:10:00.000Z',
    updateTime: '2025-11-29T18:10:00.000Z',
  }),
  review('ptl-017', {
    reviewer: { displayName: 'Sam Okonkwo' },
    starRating: 'THREE',
    comment: 'Good food, loud room. Bring someone you can hear.',
    createTime: '2025-11-18T21:00:00.000Z',
    updateTime: '2025-11-18T21:00:00.000Z',
  }),
  review('ptl-018', {
    reviewer: { displayName: 'Ines Correia' },
    starRating: 'FIVE',
    comment: 'The tasting menu with the wine pairing is the best value in Portland.',
    createTime: '2025-11-07T19:30:00.000Z',
    updateTime: '2025-11-07T19:30:00.000Z',
    reviewReply: {
      comment: 'Thank you Ines! Nuno chose most of those pairings himself.',
      updateTime: '2025-11-08T09:30:00.000Z',
      reviewReplyState: 'APPROVED',
    },
  }),
  review('ptl-019', {
    reviewer: { displayName: 'Bruno Salcedo' },
    starRating: 'FOUR',
    comment: 'Great room, great service, dessert menu is a bit thin.',
    createTime: '2025-10-30T20:00:00.000Z',
    updateTime: '2025-10-30T20:00:00.000Z',
  }),
  review('ptl-020', {
    reviewer: { displayName: 'Fiona Mac Aodha' },
    starRating: 'FIVE',
    comment: 'First place we take anyone visiting Portland. Never once been let down.',
    createTime: '2025-10-21T18:15:00.000Z',
    updateTime: '2025-10-21T18:15:00.000Z',
  }),
];

const TOTAL_REVIEW_COUNT = PAGE_ONE.length + PAGE_TWO.length;

/** Opaque: pagination is driven by the token, never an index. */
const PAGE_TWO_TOKEN = 'mock-page-2';

// Two pages so the pagination loop is exercised. `totalReviewCount` is reported on page one only, as Google does.
export function mockReviewsResponse(pageToken?: string): GbpListReviewsResponse {
  if (pageToken === PAGE_TWO_TOKEN) {
    return { reviews: PAGE_TWO, totalReviewCount: TOTAL_REVIEW_COUNT };
  }

  return {
    reviews: PAGE_ONE,
    nextPageToken: PAGE_TWO_TOKEN,
    totalReviewCount: TOTAL_REVIEW_COUNT,
    averageRating: 4.05,
  };
}

export const MOCK_REVIEW_TOTAL = TOTAL_REVIEW_COUNT;
/** Excludes the REJECTED reply, which the mapper does not import. */
export const MOCK_REVIEWS_WITH_REPLIES = [...PAGE_ONE, ...PAGE_TWO].filter(
  r => r.reviewReply !== undefined && r.reviewReply.reviewReplyState !== 'REJECTED'
).length;
