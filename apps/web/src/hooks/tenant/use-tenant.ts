import { useQuery } from "@tanstack/react-query";

import { TenantService } from "@/app/_libs/services/tenant.service";
import type { Tenant } from "@/types/domain";

export const currentTenantQueryKey = ["tenant", "current"] as const;

interface UseTenantResult {
  data: Tenant | null;
  isLoading: boolean;
  error: string | null;
}

export function useTenant(): UseTenantResult {
  const query = useQuery({
    queryKey: currentTenantQueryKey,
    queryFn: () => TenantService.getCurrentTenant(),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.isError ? "Could not load your business." : null,
  };
}
