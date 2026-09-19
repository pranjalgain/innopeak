import { hashKey } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

interface QueryErrorState {
  isError: boolean;
  /** React Query's own timestamp of the query's current error, `0` when there isn't one — changes
   *  only when a *new* failure lands, never on a re-render or a fresh mount observing a stale one. */
  errorUpdatedAt: number;
}

/**
 * Tracks, per query key, the `errorUpdatedAt` this hook has already shown a toast for — module
 * scope, not component state, so it's shared across every simultaneously mounted caller.
 */
const lastToastedAt = new Map<string, number>();

/**
 * Shows an error toast once per distinct query failure, not once per mounted component.
 *
 * React Query dedupes the underlying fetch for a shared query key, but each component that calls
 * `useQuery` for it still runs its own effect — without this, a query read by N simultaneously
 * mounted components (e.g. a shell layout's identity strip and the settings page reading the same
 * profile) shows the same "couldn't load" toast N times for one failure. Keying the dedup off
 * `errorUpdatedAt` rather than a boolean also means remounting a component that finds an
 * already-toasted error still sitting in the cache doesn't re-show it — only a genuinely new
 * failure does.
 */
export function useQueryErrorToast(
  queryKey: readonly unknown[],
  query: QueryErrorState,
  message: string,
): void {
  // React Query's own hasher, not `JSON.stringify`: it sorts object keys, so two callers passing
  // the same key with its object properties in a different order land on one dedup entry rather
  // than two (which would toast twice for one failure).
  const key = hashKey(queryKey);

  useEffect(() => {
    if (!query.isError) return;
    if (lastToastedAt.get(key) === query.errorUpdatedAt) return;
    lastToastedAt.set(key, query.errorUpdatedAt);
    toast.error(message);
  }, [key, query.isError, query.errorUpdatedAt, message]);
}
