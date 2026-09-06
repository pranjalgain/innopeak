import * as React from "react";

interface UseInfiniteListResult<T> {
  visibleItems: T[];
  hasMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Client-side infinite scroll over an already-fully-loaded array — mirrors
 * `usePagination`'s slicing approach but grows the visible slice by
 * `pageSize` whenever the sentinel element scrolls into view, instead of
 * paging. `rootRef` should point at the scrollable container so the
 * IntersectionObserver watches within it rather than the whole viewport.
 */
export function useInfiniteList<T>(
  items: T[],
  pageSize: number,
  rootRef?: React.RefObject<HTMLElement | null>,
): UseInfiniteListResult<T> {
  const [visibleCount, setVisibleCount] = React.useState(pageSize);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  // Snaps back to a full first page when the input shrinks (e.g. all notifications read/cleared).
  React.useEffect(() => {
    setVisibleCount((count) => Math.min(Math.max(count, pageSize), Math.max(items.length, pageSize)));
  }, [items.length, pageSize]);

  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) => Math.min(count + pageSize, items.length));
        }
      },
      { root: rootRef?.current ?? null, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [items.length, pageSize, rootRef]);

  return {
    visibleItems: items.slice(0, visibleCount),
    hasMore: visibleCount < items.length,
    sentinelRef,
  };
}
