import * as React from "react";

interface UsePaginationResult<T> {
  page: number;
  totalPages: number;
  pageItems: T[];
  setPage: (page: number) => void;
  goToPreviousPage: () => void;
  goToNextPage: () => void;
}

/**
 * Client-side pagination over an already-fully-loaded array — every list in
 * this app currently loads its whole mock array at once (no real backend
 * paging endpoint yet), so this just slices it for display. Swaps cleanly
 * for server-side paging later since the shape (`page`/`totalPages`/
 * `pageItems`) stays the same either way.
 */
export function usePagination<T>(items: T[], pageSize: number): UsePaginationResult<T> {
  const [page, setPageState] = React.useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Snaps back into range when the input shrinks below the current page (e.g. a filter narrows the result set).
  React.useEffect(() => {
    if (page > totalPages) setPageState(totalPages);
  }, [page, totalPages]);

  const setPage = React.useCallback(
    (next: number) => setPageState(Math.min(Math.max(next, 1), totalPages)),
    [totalPages],
  );

  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);

  return {
    page,
    totalPages,
    pageItems,
    setPage,
    goToPreviousPage: () => setPage(page - 1),
    goToNextPage: () => setPage(page + 1),
  };
}
