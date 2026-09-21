import type { AdminBusiness, PlatformActivityEntry, PlatformActivityType } from "@/types/domain";

/** A business signing up has no platform-admin actor at all — `POST /v1/auth/signup` is the
 *  tenant's own action, which is exactly why it was never one of the backend's
 *  `platform_activity_type` values (that log is scoped to actions a platform admin takes on
 *  someone else). Synthesized client-side from `AdminBusiness.createdAt`, a column that already
 *  exists and needs no new endpoint, rather than added to the real log as a type with no actor to
 *  attribute it to. */
export interface BusinessJoinedActivityEntry {
  id: string;
  type: "business_joined";
  businessName: string;
  /** Always absent — present only so `ActivityLogCard` can read `.email` across the
   *  `AdminActivityFeedEntry` union the same way it already reads `.businessName`, without a
   *  per-render type narrow for the one field a signup entry never has. */
  email?: undefined;
  occurredAt: string;
}

export type AdminActivityFeedType = PlatformActivityType | "business_joined";
export type AdminActivityFeedEntry = PlatformActivityEntry | BusinessJoinedActivityEntry;

/** How many entries the merged feed shows — the two sources are fetched and merged independently,
 *  so this is applied *after* sorting, not as a limit on either source alone. Set above the
 *  backend's own 5-per-request default for admin actions (`ADMIN_ACTIVITY_LIMIT_DEFAULT`) since a
 *  merge of two sources needs a bit more headroom to still read as "recent" for both. */
const FEED_LIMIT = 8;

/**
 * Merges the real admin-action log with synthesized "business joined" entries into one
 * time-sorted feed for `ActivityLogCard` — what the Overview page's "Activity" panel actually
 * shows. Newest first; capped to `FEED_LIMIT` after merging.
 */
export function buildActivityFeed(
  businesses: AdminBusiness[],
  recentActivity: PlatformActivityEntry[],
): AdminActivityFeedEntry[] {
  const businessJoined: BusinessJoinedActivityEntry[] = businesses.map((business) => ({
    id: `business-joined-${business.id}`,
    type: "business_joined",
    businessName: business.name,
    occurredAt: business.createdAt,
  }));

  return [...recentActivity, ...businessJoined]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, FEED_LIMIT);
}
