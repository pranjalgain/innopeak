import type { AttentionReview, DashboardStats, DateRange, RatingDistributionRow } from "@/types/domain";

export const MOCK_DASHBOARD_STATS: Record<DateRange, DashboardStats> = {
  "7d": {
    range: "7d",
    rangeLabel: "Last 7 days",
    reviewCount: 6,
    averageRating: 4.2,
    pendingApproval: 1,
    escalatedOpen: 1,
  },
  "30d": {
    range: "30d",
    rangeLabel: "Last 30 days",
    reviewCount: 24,
    averageRating: 4.1,
    pendingApproval: 4,
    escalatedOpen: 3,
  },
  "90d": {
    range: "90d",
    rangeLabel: "Last 90 days",
    reviewCount: 68,
    averageRating: 4.0,
    pendingApproval: 7,
    escalatedOpen: 6,
  },
};

const RATING_DISTRIBUTION: Record<number, number> = { 5: 8, 4: 7, 3: 5, 2: 3, 1: 1 };
const MAX_DISTRIBUTION_COUNT = 8;

export const MOCK_RATING_DISTRIBUTION: RatingDistributionRow[] = [5, 4, 3, 2, 1].map((star) => {
  const count = RATING_DISTRIBUTION[star] ?? 0;
  return {
    star: star as RatingDistributionRow["star"],
    count,
    percentage: Math.round((count / MAX_DISTRIBUTION_COUNT) * 100),
  };
});

export const MOCK_ATTENTION_REVIEWS: AttentionReview[] = [
  {
    id: "rev_03",
    reviewerName: "Connor Blake",
    initials: "CB",
    rating: 2,
    snippet:
      "Reservation for 7pm, wasn't seated until 7:40 with no apology. Food was fine but…",
    escalationReason: "low_rating",
  },
  {
    id: "rev_05",
    reviewerName: "Marcus Yee",
    initials: "MY",
    rating: 5,
    snippet:
      "My uncle is a lawyer and even he agreed this was the best deal in town for the t…",
    escalationReason: "blocklist_match",
  },
  {
    id: "rev_08",
    reviewerName: "Holly Bergstrom",
    initials: "HB",
    rating: 2,
    snippet:
      "Charged us for a bottle of wine we never ordered and it took three attempts to g…",
    escalationReason: "low_rating",
  },
];
