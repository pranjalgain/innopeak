import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { AdminBillingService } from "@/app/_libs/services/admin-billing.service";
import { adminBillingHasPaidTenantsQueryKey } from "@/hooks/admin/admin-query-keys";

/**
 * Cheap existence check, separate from `useAdminBilling` because `AdminLayout` calls it on every
 * admin page just to decide whether the Billing nav item shows. It stays true independent of
 * `paymentFeatureEnabled` (see `AdminBillingService.hasPaidTenants`).
 */
export function useAdminHasPaidTenants(): UseQueryResult<boolean> {
  return useQuery({
    queryKey: adminBillingHasPaidTenantsQueryKey,
    queryFn: () => AdminBillingService.hasPaidTenants(),
  });
}
