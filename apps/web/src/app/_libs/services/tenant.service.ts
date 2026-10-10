import { ConnectionService } from "@/app/_libs/services/connection.service";
import { TenantOwnerProfileService } from "@/app/_libs/services/tenant-owner-profile.service";
import type { Tenant } from "@/types/domain";

/** Both reads are open to team members as well as owners, so the dashboard header works for either role. */
export class TenantService {
  static async getCurrentTenant(): Promise<Tenant> {
    const [profile, connection] = await Promise.all([
      TenantOwnerProfileService.get(),
      ConnectionService.getState(),
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
              lastSyncedAt: location.lastSyncedAt,
            }
          : null,
    };
  }
}
