import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ConnectionService } from "@/app/_libs/services/connection.service";
import { TenantOwnerProfileService } from "@/app/_libs/services/tenant-owner-profile.service";
import { TenantService } from "@/app/_libs/services/tenant.service";
import { connectionQueryKey } from "@/hooks/connections/use-connection";
import { tenantOwnerProfileQueryKey } from "@/hooks/settings/use-tenant-owner-profile";
import type { Tenant } from "@/types/domain";

export const currentTenantQueryKey = ["tenant", "current"] as const;

interface UseTenantResult {
  data: Tenant | null;
  isLoading: boolean;
  error: string | null;
}

export function useTenant(): UseTenantResult {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: currentTenantQueryKey,
    // Through the shared caches, not straight to the network: the app shell already loads the profile (`/v1/auth/me`) and
    // the connection (`/v1/connections`), and reading them again here doubled both calls on every dashboard load.
    queryFn: () =>
      TenantService.getCurrentTenant({
        profile: () =>
          queryClient.fetchQuery({
            queryKey: tenantOwnerProfileQueryKey,
            queryFn: () => TenantOwnerProfileService.get(),
          }),
        connection: () =>
          queryClient.fetchQuery({
            queryKey: connectionQueryKey,
            queryFn: ({ signal }) => ConnectionService.getState(signal),
          }),
      }),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.isError ? "Could not load your business." : null,
  };
}
