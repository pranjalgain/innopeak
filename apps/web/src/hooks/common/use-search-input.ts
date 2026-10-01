import { useState } from "react";

import { useDebouncedValue } from "@/hooks/common/use-debounced-value";

interface UseSearchInputResult {
  /** The raw, live input value — bind directly to the search box's `value`, untouched, so a user
   *  composing a multi-word term still sees exactly what they typed (including a trailing space). */
  search: string;
  setSearch: (search: string) => void;
  /** Trimmed and debounced — what a search-driven query should actually key off and send to the
   *  server. Trimmed *before* debouncing (not after), so this is never out of step with
   *  `isSearching`: both are read off the same value in the same render, whereas deriving
   *  `isSearching` from the raw `search` instead (as `admin-businesses-view.tsx`/
   *  `admin-users-view.tsx` used to) let the two disagree for up to the debounce window — e.g.
   *  clearing a zero-match search flipped `isSearching` to `false` instantly while the stale
   *  empty result was still on screen, flashing the wrong empty-state copy; a whitespace-only
   *  search separately behaved as "not searching" in the UI while still reaching the server
   *  untrimmed. */
  debouncedSearch: string;
  isSearching: boolean;
}

/**
 * A search box's full state, in one place — extracted after `useAdminBusinesses`/`useAdminUsers`
 * each hand-rolled their own raw/debounced pair and the consuming view separately (and
 * inconsistently) derived its own "is a search active" flag from the raw value instead of this
 * same debounced one.
 */
export function useSearchInput(delayMs: number): UseSearchInputResult {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), delayMs);

  return { search, setSearch, debouncedSearch, isSearching: debouncedSearch.length > 0 };
}
