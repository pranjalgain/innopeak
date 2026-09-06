import {
  MOCK_APPROVAL_BREAKDOWN,
  MOCK_ATTENTION_REVIEWS,
  MOCK_DASHBOARD_STATS,
  MOCK_ESCALATION_BREAKDOWN,
  MOCK_RATING_DISTRIBUTION,
} from "@/app/_libs/mock-data/dashboard-stats";
import type {
  ApprovalBreakdownRow,
  AttentionReview,
  DashboardStats,
  DateRange,
  EscalationBreakdownRow,
  RatingDistributionRow,
} from "@/types/domain";

/**
 * Dashboard service. Mock implementation — becomes real backend calls
 * (review stats, escalated-review queries) once that API exists. Hooks and
 * components only ever call `useDashboardStats`, never this class directly.
 */
export class DashboardService {
  static async getStats(range: DateRange): Promise<DashboardStats> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_DASHBOARD_STATS[range];
  }

  static async getRatingDistribution(): Promise<RatingDistributionRow[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_RATING_DISTRIBUTION;
  }

  static async getAttentionReviews(): Promise<AttentionReview[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_ATTENTION_REVIEWS;
  }

  static async getApprovalBreakdown(range: DateRange): Promise<ApprovalBreakdownRow[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_APPROVAL_BREAKDOWN[range];
  }

  static async getEscalationBreakdown(range: DateRange): Promise<EscalationBreakdownRow[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_ESCALATION_BREAKDOWN[range];
  }
}
