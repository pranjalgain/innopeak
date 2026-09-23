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
