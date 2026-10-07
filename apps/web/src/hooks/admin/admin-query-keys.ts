/** Query keys live apart from the hooks so they can share keys without importing each other's modules (that was a circular import). */

export const adminBusinessesQueryKey = ["admin", "businesses"] as const;
export const adminUsersQueryKey = ["admin", "users"] as const;
export const adminOverviewStatsQueryKey = ["admin", "overview", "stats"] as const;
export const adminOverviewRecentBusinessesQueryKey = [
  "admin",
  "overview",
  "recent-businesses",
] as const;
export const adminOverviewNeedsAttentionQueryKey = [
  "admin",
  "overview",
  "needs-attention",
] as const;
export const adminOverviewSignupTrendQueryKey = ["admin", "overview", "signup-trend"] as const;
export const adminOverviewActivityQueryKey = ["admin", "overview", "activity"] as const;
/** Paginated Platform activity tab, distinct from the Overview glance feed; every `platform_activity_log` write invalidates both prefixes. */
export const adminOverviewActivityLogQueryKey = [
  "admin",
  "overview",
  "activity-log",
] as const;
export const adminStatisticsSummaryQueryKey = ["admin", "statistics", "summary"] as const;
export const adminBillingSummaryQueryKey = ["admin", "billing", "summary"] as const;
export const adminBillingHasPaidTenantsQueryKey = [
  "admin",
  "billing",
  "has-paid-tenants",
] as const;
export const adminBillingWebhookEventsQueryKey = [
  "admin",
  "billing",
  "webhook-events",
] as const;
