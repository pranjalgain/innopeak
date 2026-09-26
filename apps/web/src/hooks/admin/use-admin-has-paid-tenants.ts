import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { AdminBillingService } from "@/app/_libs/services/admin-billing.service";
import { adminBillingHasPaidTenantsQueryKey } from "@/hooks/admin/admin-query-keys";

/**
 * `GET /v1/admin/billing/has-paid-tenants` — a cheap existence check, separate from
 * `useAdminBilling`'s full summary query on purpose: `AdminLayout` calls this on every `/admin/*`
 * page just to decide whether the Billing nav item stays visible, and firing the full
 * summary (plan split, upgrade trend, at-risk subscriptions, recent webhook events) on every
 * admin page load just for that would be wasteful. See `AdminBillingService.hasPaidTenants`'s own
 * doc comment for why this can't simply be folded into `paymentFeatureEnabled` — the whole point
 * is that it stays true independent of that flag.
 */
export function useAdminHasPaidTenants(): UseQueryResult<boolean> {
  return useQuery({
    queryKey: adminBillingHasPaidTenantsQueryKey,
    queryFn: () => AdminBillingService.hasPaidTenants(),
  });
}
