import { useState } from "react";

import { useDebouncedValue } from "@/hooks/common/use-debounced-value";

interface UseSearchInputResult {
  /** The raw input value; bind it to the box's `value` so a multi-word term keeps exactly what was typed (including a trailing space). */
  search: string;
  setSearch: (search: string) => void;
  /** Trimmed then debounced, for the query key and request. Trimming before debouncing keeps it in step with `isSearching` (same value, same render); deriving `isSearching` from the raw input flashed the wrong empty state and let whitespace-only searches reach the server. */
  debouncedSearch: string;
  isSearching: boolean;
}

export function useSearchInput(delayMs: number): UseSearchInputResult {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), delayMs);

  return { search, setSearch, debouncedSearch, isSearching: debouncedSearch.length > 0 };
}
