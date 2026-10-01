import type { AdminBusinessSummary } from '@db/repositories/admin-businesses/types/admin-businesses.type';

import { PlatformActivityResponseDto } from '../dto/platform-activity-response.dto';

/**
 * Merges the real admin-action log with synthesized `business_joined` entries into one
 * time-sorted feed — what `ApiGetRecentActivity` actually returns. Newest first, capped to
 * `limit` after merging (not per-source): fetching `limit` newest rows from *each* source before
 * calling this is always enough, since the true top-`limit` of the union can never need more than
 * `limit` items from either source alone.
 *
 * Previously assembled client-side (`admin-activity-feed.ts`'s `buildActivityFeed`, two separate
 * fetches merged in the browser) — moved here so the frontend gets one already-merged response
 * from one endpoint instead of stitching two together itself.
 */
export function buildActivityFeed(
  activities: PlatformActivityResponseDto[],
  businesses: AdminBusinessSummary[],
  limit: number
): PlatformActivityResponseDto[] {
  const businessJoined = businesses.map(business =>
    PlatformActivityResponseDto.fromBusinessJoined(business)
  );

  return [...activities, ...businessJoined]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}
