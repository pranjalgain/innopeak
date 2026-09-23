import { useMemo, useState } from "react";

interface UseSearchFilterResult<T> {
  search: string;
  setSearch: (value: string) => void;
  filtered: T[];
}

/**
 * Client-side substring search over an already-loaded array — trims/lowercases the query and
 * matches if any of `fields` (read directly off each item) contains it. Shared by the admin
 * Businesses and Users screens, which previously each hand-rolled this same `useState` + `useMemo`
 * pattern with only their searched fields differing.
 *
 * `fields` takes property keys, not a closure, so callers can pass a module-level constant
 * (e.g. `["name", "ownerName"] as const`) with a stable reference across renders — a fresh inline
 * function or array literal here would invalidate the `useMemo` below on every render regardless
 * of whether `items`/`search` actually changed.
 */
export function useSearchFilter<T>(
  items: T[],
  fields: readonly (keyof T)[],
): UseSearchFilterResult<T> {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      fields.some((field) => String(item[field]).toLowerCase().includes(query)),
    );
  }, [items, search, fields]);

  return { search, setSearch, filtered };
}
