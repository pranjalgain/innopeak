import { adminOverviewApi } from "@/app/_libs/api-sdk/admin-overview-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { PlatformActivityEntry } from "@/types/domain";

/** The SDK's generated response DTO carries `businessName`/`email` as `string | null` (every
 * entry has both keys, only one populated depending on `type`) — mapped here to `undefined` so
 * `PlatformActivityEntry` can keep declaring them as plain optional fields, matching how the rest
 * of the admin domain types already read (nothing else in this file's shape needs `| null`). */
function toDomain(dto: {
  id: string;
  type: PlatformActivityEntry["type"];
  actorEmail: string;
  businessName: string | null;
  email: string | null;
  occurredAt: string;
}): PlatformActivityEntry {
  return {
    id: dto.id,
    type: dto.type,
    actorEmail: dto.actorEmail,
    businessName: dto.businessName ?? undefined,
    email: dto.email ?? undefined,
    occurredAt: dto.occurredAt,
  };
}

/**
 * A log of platform-admin actions (business suspend/reactivate, admin invite send/revoke,
 * admin enable/disable, tenant-user activate/deactivate), against the real
 * `GET /v1/admin/overview/activity` endpoint. Hooks/components only ever call
 * `useAdminOverview`, never this class directly.
 */
export class AdminActivityService {
  static async getRecentActivity(): Promise<PlatformActivityEntry[]> {
    const response = await adminOverviewApi.adminOverviewControllerGetRecentActivityV1();
    const rows = unwrap<
      {
        id: string;
        type: PlatformActivityEntry["type"];
        actorEmail: string;
        businessName: string | null;
        email: string | null;
        occurredAt: string;
      }[]
    >(response.data);
    return rows.map(toDomain);
  }
}
