
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

type UrlUpdates = Record<string, string | null>;

interface UseUrlQueryStateResult {
  /** The current query string; reading it subscribes the component to URL changes (Back/Forward included). */
  searchParams: URLSearchParams;
  /**
   * Sets (or, with `null`, removes) query parameters in one navigation. `push` adds a history entry, so Back returns to
   * the previous page of a list; `replace` (the default) suits filters and typing, which should not each be a Back stop.
   */
  update: (updates: UrlUpdates, mode?: "push" | "replace") => void;
}

/**
 * List state (page, filters, search) kept in the address bar so Back/Forward and a reload keep your place. The other
 * parameters on the URL are left alone.
 */
export function useUrlQueryState(): UseUrlQueryStateResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The query string the last `update` asked for, until the router has actually applied it. `router.push/replace` is
  // asynchronous, so `window.location` still shows the old URL for a moment; a second update in that window (a page
  // clamp right after a search write, say) must build on what was just requested or it would overwrite it.
  const requested = useRef<string | null>(null);
  const currentQuery = searchParams.toString();
  useEffect(() => {
    requested.current = null;
  }, [currentQuery]);

  const update = useCallback(
    (updates: UrlUpdates, mode: "push" | "replace" = "replace") => {
      const base = requested.current ?? window.location.search;
      const params = new URLSearchParams(base);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      const href = `${pathname}${query ? `?${query}` : ""}`;
      if (href === `${pathname}${base}` || (base === "" && query === "")) return;
      requested.current = query;
      // `typedRoutes` can't see that this only differs from the current route in its query string.
      router[mode](href as Route, { scroll: false });
    },
    [router, pathname],
  );

  return { searchParams: new URLSearchParams(currentQuery), update };
}

/** A 1-based page number from a query value; anything missing, non-numeric or below 1 means the first page. */
export function parsePageParam(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/** A value from a closed set, or `undefined` when the URL has none or a value the screen does not offer (a stale or hand-edited link). */
export function parseChoiceParam<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | undefined {
  return allowed.find((choice) => choice === value);
}
