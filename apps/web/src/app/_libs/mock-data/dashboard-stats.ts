import type {
  ApprovalBreakdownRow,
  AttentionReview,
  DashboardStats,
  DateRange,
  EscalationBreakdownRow,
  RatingDistributionRow,
} from "@/types/domain";

export const MOCK_DASHBOARD_STATS: Record<DateRange, DashboardStats> = {
  "7d": {
    range: "7d",
    rangeLabel: "Last 7 days",
    reviewCount: 6,
    averageRating: 4.2,
    pendingApproval: 1,
    escalatedOpen: 1,
    medianApprovalTimeMinutes: 38,
  },
  "30d": {
    range: "30d",
    rangeLabel: "Last 30 days",
    reviewCount: 24,
    averageRating: 4.1,
    pendingApproval: 4,
    escalatedOpen: 3,
    medianApprovalTimeMinutes: 52,
  },
  "90d": {
    range: "90d",
    rangeLabel: "Last 90 days",
    reviewCount: 68,
    averageRating: 4.0,
    pendingApproval: 7,
    escalatedOpen: 6,
    medianApprovalTimeMinutes: 61,
  },
};

const APPROVAL_COUNTS: Record<DateRange, { approvedAsIs: number; approvedEdited: number; rejected: number }> = {
  "7d": { approvedAsIs: 3, approvedEdited: 1, rejected: 1 },
  "30d": { approvedAsIs: 13, approvedEdited: 5, rejected: 2 },
  "90d": { approvedAsIs: 40, approvedEdited: 15, rejected: 6 },
};

export const MOCK_APPROVAL_BREAKDOWN: Record<DateRange, ApprovalBreakdownRow[]> = Object.fromEntries(
  Object.entries(APPROVAL_COUNTS).map(([range, counts]) => {
    const total = counts.approvedAsIs + counts.approvedEdited + counts.rejected;
    const pct = (count: number) => (total === 0 ? 0 : Math.round((count / total) * 100));
    const rows: ApprovalBreakdownRow[] = [
      { outcome: "approved_as_is", count: counts.approvedAsIs, percentage: pct(counts.approvedAsIs) },
      { outcome: "approved_edited", count: counts.approvedEdited, percentage: pct(counts.approvedEdited) },
      { outcome: "rejected", count: counts.rejected, percentage: pct(counts.rejected) },
    ];
    return [range, rows];
  }),
) as Record<DateRange, ApprovalBreakdownRow[]>;

const ESCALATION_COUNTS: Record<DateRange, { lowRating: number; blocklistMatch: number }> = {
  "7d": { lowRating: 1, blocklistMatch: 0 },
  "30d": { lowRating: 2, blocklistMatch: 1 },
  "90d": { lowRating: 4, blocklistMatch: 2 },
};

export const MOCK_ESCALATION_BREAKDOWN: Record<DateRange, EscalationBreakdownRow[]> = Object.fromEntries(
  Object.entries(ESCALATION_COUNTS).map(([range, counts]) => {
    const total = counts.lowRating + counts.blocklistMatch;
    const pct = (count: number) => (total === 0 ? 0 : Math.round((count / total) * 100));
    const rows: EscalationBreakdownRow[] = [
      { reason: "low_rating", count: counts.lowRating, percentage: pct(counts.lowRating) },
      { reason: "blocklist_match", count: counts.blocklistMatch, percentage: pct(counts.blocklistMatch) },
    ];
    return [range, rows];
  }),
) as Record<DateRange, EscalationBreakdownRow[]>;

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
