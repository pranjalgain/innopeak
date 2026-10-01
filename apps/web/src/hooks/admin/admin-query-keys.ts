/**
 * TanStack Query keys shared across the admin hooks — split out on its own so those hooks can
 * import each other's keys (the Overview page reads the same cache the Businesses/Users screens
 * write to, and every mutation on those screens invalidates Overview's activity feed) without
 * importing each other's *modules*, which is what created a three-way circular import between
 * `use-admin-overview.ts`, `use-admin-businesses.ts`, and `use-admin-users.ts`.
 */

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
/** The dedicated Activity page's paginated "Platform activity" tab — distinct from
 *  `adminOverviewActivityQueryKey` above (the Overview page's bounded glance feed). Every mutation
 *  that writes to `platform_activity_log` (business suspend/reactivate, user toggle, admin invite
 *  send/revoke/status) invalidates both prefixes, not just one. */
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
