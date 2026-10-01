import { useEffect, useState } from "react";

/**
 * Delays reflecting `value` until it stops changing for `delayMs` — extracted after the same
 * `useState` + `useEffect(() => setTimeout(...))` block was hand-rolled independently in
 * `useReviewQueue`, `useAdminBusinesses`, and `useAdminUsers`, each with its own local
 * `SEARCH_DEBOUNCE_MS` constant. Used to turn a search box's every-keystroke updates into one
 * request per typing pause, not one per character.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
