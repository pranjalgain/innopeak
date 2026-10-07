import { hashKey } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

interface QueryErrorState {
  isError: boolean;
  /** `0` without an error; changes only on a new failure, not on re-render or a fresh mount seeing a stale one. */
  errorUpdatedAt: number;
}

/** Per query key, the `errorUpdatedAt` already toasted; module scope so it is shared across simultaneously mounted callers. */
const lastToastedAt = new Map<string, number>();

/** One error toast per distinct failure, not per mounted component (React Query dedupes the fetch, not each caller's effect). Keyed on `errorUpdatedAt` so remounting onto an already-toasted cached error doesn't re-show it. */
export function useQueryErrorToast(
  queryKey: readonly unknown[],
  query: QueryErrorState,
  message: string,
): void {
  // React Query's hasher sorts object keys, so the same key with properties in a different order dedupes to one entry.
  const key = hashKey(queryKey);

  useEffect(() => {
    if (!query.isError) return;
    if (lastToastedAt.get(key) === query.errorUpdatedAt) return;
    lastToastedAt.set(key, query.errorUpdatedAt);
    toast.error(message);
  }, [key, query.isError, query.errorUpdatedAt, message]);
}
