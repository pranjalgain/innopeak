import { useCallback, useEffect, useRef, useState } from "react";

import { useDebouncedValue } from "@/hooks/common/use-debounced-value";
import { parsePageParam, useUrlQueryState } from "@/hooks/common/use-url-query-state";

const SEARCH_PARAM = "q";
const PAGE_PARAM = "page";

/** Just under the strictest API limit (admin lists: 200), so a typed, pasted or linked term can never earn a 400 that reads as a server fault. */
export const MAX_SEARCH_LENGTH = 200;

const clampSearch = (value: string): string => value.slice(0, MAX_SEARCH_LENGTH);

interface UseUrlSearchPageResult {
  /** The raw input value; bind it to the box so a multi-word term keeps exactly what was typed. */
  search: string;
  setSearch: (search: string) => void;
  /** Trimmed then debounced, for the query key and request. */
  debouncedSearch: string;
  isSearching: boolean;
  /** 1-based, from `?page=`. A pending search reads as page 1, so a new term never asks for a page of the old one. */
  page: number;
  /** Pushes a history entry, so Back returns to the previous page of the list. */
  setPage: (page: number) => void;
  /** Pulls an out-of-range `?page=` (a stale link, a shrunken list) back to the last real page without adding a Back stop. */
  clampPage: (totalPages: number) => void;
}

/**
 * A server-paged, searchable list whose page and search term live in the URL (`?page=2&q=term`), so Back/Forward and a
 * reload keep the place. Typing and search changes replace the history entry; changing page pushes one.
 */
export function useUrlSearchPage(debounceMs: number): UseUrlSearchPageResult {
  const { searchParams, update } = useUrlQueryState();
  const urlSearch = clampSearch(searchParams.get(SEARCH_PARAM) ?? "");
  const urlPage = parsePageParam(searchParams.get(PAGE_PARAM));

  const [search, setSearchState] = useState(urlSearch);
  const setSearch = useCallback((next: string) => setSearchState(clampSearch(next)), []);
  const debouncedSearch = useDebouncedValue(search.trim(), debounceMs);
  // The last term this hook and the URL agreed on: tells our own write apart from a Back/Forward navigation.
  const synced = useRef(urlSearch.trim());

  useEffect(() => {
    if (debouncedSearch === synced.current) return;
    synced.current = debouncedSearch;
    // A new term can leave the current page out of range, so it always starts again from page 1.
    update({ [SEARCH_PARAM]: debouncedSearch || null, [PAGE_PARAM]: null });
  }, [debouncedSearch, update]);

  useEffect(() => {
    if (urlSearch.trim() === synced.current) return;
    synced.current = urlSearch.trim();
    setSearchState(urlSearch);
  }, [urlSearch]);

  const setPage = useCallback(
    (next: number) => update({ [PAGE_PARAM]: next <= 1 ? null : String(next) }, "push"),
    [update],
  );

  const clampPage = useCallback(
    (totalPages: number) => {
      // Not while a new term is still on its way into the URL: that write drops the page anyway, and `totalPages` here
      // describes the new term's results, not the page the URL still shows.
      if (debouncedSearch !== urlSearch.trim()) return;
      if (urlPage > totalPages)
        update({ [PAGE_PARAM]: totalPages <= 1 ? null : String(totalPages) });
    },
    [update, urlPage, debouncedSearch, urlSearch],
  );

  return {
    search,
    setSearch,
    debouncedSearch,
    isSearching: debouncedSearch.length > 0,
    page: debouncedSearch === urlSearch.trim() ? urlPage : 1,
    setPage,
    clampPage,
  };
}
