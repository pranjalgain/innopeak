import type { AdminBusinessSummary } from '@db/repositories/admin-businesses/types/admin-businesses.type';

import { PlatformActivityResponseDto } from '../dto/platform-activity-response.dto';

/**
 * Newest first, capped to `limit` after merging: fetching `limit` rows from each source beforehand
 * is always enough, since the top `limit` of the union never needs more from either source.
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
