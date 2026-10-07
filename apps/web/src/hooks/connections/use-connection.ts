import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/app/_libs/services/api-error";
import { ConnectionService, type ConnectionState } from "@/app/_libs/services/connection.service";
import { isInitialLoad } from "@/hooks/common/is-initial-load";

export const connectionQueryKey = ["connection"] as const;

export interface UseConnectionResult {
  state: ConnectionState | null;
  /** True only before the first successful load — never for a background refetch. */
  isLoading: boolean;
  /**
   * Set when the fetch failed for a non-401 reason. The guard fails *open* on it: a transient 5xx must not eject a paying
   * customer into onboarding; a real 401 is handled upstream (interceptor clears the token, `RequireAuth` redirects).
   */
  error: Error | null;
  refresh: () => Promise<void>;
}

/** `GET /v1/connections`, shared app-wide through react-query's cache (no Context needed), which dedupes concurrent calls. */
export function useConnection(): UseConnectionResult {
  const query = useQuery({
    queryKey: connectionQueryKey,
    queryFn: ({ signal }) => ConnectionService.getState(signal),
  });

  // A 401 isn't recorded as an error: the interceptor already cleared the token and `RequireAuth` is redirecting, so
  // surfacing it would race a toast against the redirect.
  const error =
    query.error && !(query.error instanceof ApiError && query.error.statusCode === 401)
      ? query.error
      : null;

  return {
    state: query.data ?? null,
    // `isLoading`, not `isFetching`: the key is shared app-wide, so a second observer mounting or a refetchOnReconnect must
    // not blank the connected dashboard back to a skeleton; a failed query being retried doesn't count (see `isInitialLoad`).
    isLoading: isInitialLoad(query),
    error,
    refresh: async () => {
      await query.refetch();
    },
  };
}
