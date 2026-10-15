import { ConnectionService, type ConnectionState } from "@/app/_libs/services/connection.service";
import { TenantOwnerProfileService } from "@/app/_libs/services/tenant-owner-profile.service";
import type { Tenant, TenantOwnerProfile } from "@/types/domain";

/** Where the two reads come from. The default is the network; a caller with a query cache passes its cached readers so a page does not fetch what the app shell already holds. */
export interface TenantSources {
  profile?: () => Promise<TenantOwnerProfile>;
  connection?: () => Promise<ConnectionState>;
}

/** Both reads are open to team members as well as owners, so the dashboard header works for either role. */
export class TenantService {
  static async getCurrentTenant(sources: TenantSources = {}): Promise<Tenant> {
    const [profile, connection] = await Promise.all([
      (sources.profile ?? (() => TenantOwnerProfileService.get()))(),
      (sources.connection ?? (() => ConnectionService.getState()))(),
    ]);

    const location = connection.location;
    return {
      name: profile.businessName,
      location:
        location && location.status === "active"
          ? {
              name: location.businessName,
              address: location.address,
              phone: location.phone ?? null,
              websiteUri: location.websiteUri ?? null,
              category: location.category ?? null,
              googleRating: location.googleRating ?? null,
              googleReviewCount: location.googleReviewCount ?? null,
              lastSyncedAt: location.lastSyncedAt,
              syncStatus: location.lastSyncStatus,
            }
          : null,
    };
  }
}
