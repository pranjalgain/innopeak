import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/app/_libs/services/api-error";
import { ConnectionService, type ConnectionState } from "@/app/_libs/services/connection.service";

export const connectionQueryKey = ["connection"] as const;

export interface UseConnectionResult {
  state: ConnectionState | null;
  /** True only before the first successful load — never for a background refetch. */
  isLoading: boolean;
  /**
   * Set when the fetch failed for a reason that is NOT a 401. The guard fails *open* on this: a
   * transient 5xx or a dropped network must not eject a paying customer into onboarding. A genuine
   * 401 is already handled upstream (the axios interceptor clears the token, `RequireAuth`
   * redirects to /login), so failing open here cannot mask an auth failure.
   */
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * `GET /v1/connections`, shared across the whole app through react-query's own cache — no
 * Context/Provider needed: the dashboard layout, the onboarding-connect screen (a different route
 * group), and Settings' Connection tab all call this same hook and share one cached answer, with
 * react-query deduping concurrent calls into a single request.
 */
export function useConnection(): UseConnectionResult {
  const query = useQuery({
    queryKey: connectionQueryKey,
    queryFn: ({ signal }) => ConnectionService.getState(signal),
  });

  // A 401 is not recorded as an error: the axios interceptor has already cleared the token and
  // RequireAuth is about to redirect, so surfacing it here would race a "connection unavailable"
  // toast against a login redirect. react-query keeps the last-good `data` around across a failed
  // refetch on its own, so a stale `state` naturally persists through this exactly as before.
  const error =
    query.error && !(query.error instanceof ApiError && query.error.statusCode === 401)
      ? query.error
      : null;

  return {
    state: query.data ?? null,
    // `isLoading`, not `isFetching`: this query key is shared app-wide (dashboard layout, Settings'
    // Connection tab), so a second observer mounting or a `refetchOnReconnect` firing while cached
    // data is still valid must not blank `ConnectionGuard`'s already-connected dashboard back to a
    // skeleton — only the first, data-less load should.
    isLoading: query.isLoading,
    error,
    refresh: async () => {
      await query.refetch();
    },
  };
}
