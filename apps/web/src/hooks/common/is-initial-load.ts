import type { UseQueryResult } from "@tanstack/react-query";

/**
 * True only for the first load, not a refetch of an already-failed query. TanStack resets an errored data-less query to
 * `pending` on refetch, and the guard's swapped-in children trigger that retry on mount, so plain `isLoading` made the
 * guard flip skeleton <-> children indefinitely (~100 req/s); a once-failed query must fail open instead.
 */
export function isInitialLoad(query: Pick<UseQueryResult, "isLoading" | "errorUpdatedAt">): boolean {
  return query.isLoading && query.errorUpdatedAt === 0;
}
