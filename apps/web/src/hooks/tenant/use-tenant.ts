import * as React from "react";

import { TenantService } from "@/app/_libs/services/tenant.service";
import type { Tenant } from "@/types/domain";

interface UseTenantResult {
  data: Tenant | null;
  isLoading: boolean;
  error: string | null;
}

export function useTenant(): UseTenantResult {
  const [data, setData] = React.useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    TenantService.getCurrentTenant()
      .then((tenant) => {
        if (!cancelled) setData(tenant);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your business.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, isLoading, error };
}
