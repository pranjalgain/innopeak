import type { AdminOverviewControllerListActivityV1TypeEnum } from "@innopeak/client-sdk";

import { adminOverviewApi } from "@/app/_libs/api-sdk/admin-overview-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { PlatformActivityEntry, PlatformActivityList, PlatformActivityType } from "@/types/domain";

export interface ListPlatformActivityParams {
  page: number;
  pageSize: number;
  type?: PlatformActivityType;
}

// `actorEmail` stays `string | null` (always present; null for `business_joined`). `businessName`/`email` are
// coalesced to `undefined` because they are genuinely absent depending on `type`.
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

  /** Paginated and filterable, independent of the bounded top-N read above. */
  static async listActivity(params: ListPlatformActivityParams): Promise<PlatformActivityList> {
    const response = await adminOverviewApi.adminOverviewControllerListActivityV1({
      page: params.page,
      pageSize: params.pageSize,
      // Same string-literal set as `PlatformActivityType` but a distinct nominal type; safe to cast.
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
