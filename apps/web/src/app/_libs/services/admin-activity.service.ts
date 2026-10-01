import type { AdminOverviewControllerListActivityV1TypeEnum } from "@innopeak/client-sdk";

import { adminOverviewApi } from "@/app/_libs/api-sdk/admin-overview-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { PlatformActivityEntry, PlatformActivityList, PlatformActivityType } from "@/types/domain";

export interface ListPlatformActivityParams {
  page: number;
  pageSize: number;
  type?: PlatformActivityType;
}

/** The SDK's generated response DTO carries `actorEmail`/`businessName`/`email` as `string | null`
 * (every entry has all three keys, only the ones relevant to `type` populated — a `business_joined`
 * entry has no actor at all). `actorEmail` passes straight through as `string | null`, matching the
 * DTO exactly — `PlatformActivityEntry.actorEmail` declares the same nullable type, not an optional
 * one, since `null` is a real, always-present value here (a `business_joined` entry sends it
 * explicitly), not an absent key. `businessName`/`email` are still coalesced to `undefined`, since
 * those two genuinely are absent-vs-present depending on `type` and the rest of this admin domain's
 * types already read that way. */
function toDomain(dto: {
  id: string;
  type: PlatformActivityEntry["type"];
  actorEmail: string | null;
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
        actorEmail: string | null;
        businessName: string | null;
        email: string | null;
        occurredAt: string;
      }[]
    >(response.data);
    return rows.map(toDomain);
  }

  /** `GET /v1/admin/overview/activity-log` — paginated, filterable, independent of the bounded
   *  top-N read above. */
  static async listActivity(params: ListPlatformActivityParams): Promise<PlatformActivityList> {
    const response = await adminOverviewApi.adminOverviewControllerListActivityV1({
      page: params.page,
      pageSize: params.pageSize,
      // The SDK's generated enum is structurally identical to `PlatformActivityType` (same string
      // literal set) but a distinct nominal type — safe to cast rather than re-declare it.
      type: params.type as AdminOverviewControllerListActivityV1TypeEnum,
    });
    const dto = unwrap<{
      activities: {
        id: string;
        type: PlatformActivityEntry["type"];
        actorEmail: string | null;
        businessName: string | null;
        email: string | null;
        occurredAt: string;
      }[];
      meta: PlatformActivityList["meta"];
    }>(response.data);
    return { activities: dto.activities.map(toDomain), meta: dto.meta };
  }
}
