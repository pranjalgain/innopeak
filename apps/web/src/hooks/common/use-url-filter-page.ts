import { useCallback } from "react";

import {
  parseChoiceParam,
  parsePageParam,
  useUrlQueryState,
} from "@/hooks/common/use-url-query-state";

const PAGE_PARAM = "page";

interface UseUrlFilterPageResult<T extends string> {
  /** The chosen value, or `"all"` when the URL has none or an unknown one. */
  filter: T | "all";
  /** Drops `page` in the same navigation, since a new filter can leave the current page out of range. */
  setFilter: (filter: T | "all") => void;
  /** 1-based, from `?page=`. */
  page: number;
  /** Pushes a history entry, so Back returns to the previous page of the list. */
  setPage: (page: number) => void;
  /** Pulls an out-of-range `?page=` back to the last real page without adding a Back stop. */
  clampPage: (totalPages: number) => void;
}

/**
 * A server-paged list with one filter whose page and filter live in the URL (`?page=2&type=…`), so Back/Forward and a
 * reload keep the place. See `useUrlSearchPage` for the same idea with a search box.
 */
export function useUrlFilterPage<T extends string>(
  param: string,
  allowed: readonly T[],
): UseUrlFilterPageResult<T> {
  const { searchParams, update } = useUrlQueryState();
  const filter = parseChoiceParam(searchParams.get(param), allowed) ?? "all";
  const page = parsePageParam(searchParams.get(PAGE_PARAM));

  const setFilter = useCallback(
    (next: T | "all") => update({ [param]: next === "all" ? null : next, [PAGE_PARAM]: null }),
    [update, param],
  );
  const setPage = useCallback(
    (next: number) => update({ [PAGE_PARAM]: next <= 1 ? null : String(next) }, "push"),
    [update],
  );
  const clampPage = useCallback(
    (totalPages: number) => {
      if (page > totalPages) update({ [PAGE_PARAM]: totalPages <= 1 ? null : String(totalPages) });
    },
    [update, page],
  );

  return { filter, setFilter, page, setPage, clampPage };
}
