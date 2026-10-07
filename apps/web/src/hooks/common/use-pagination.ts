import { useCallback, useEffect, useState } from "react";

interface UsePaginationResult<T> {
  page: number;
  totalPages: number;
  pageItems: T[];
  setPage: (page: number) => void;
  goToPreviousPage: () => void;
  goToNextPage: () => void;
}

/** Slices an already-loaded array for display; the `page`/`totalPages`/`pageItems` shape would stay the same under server-side paging. */
export function usePagination<T>(items: T[], pageSize: number): UsePaginationResult<T> {
  const [page, setPageState] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Snaps back into range when the input shrinks below the current page (e.g. a filter narrows the result set).
  useEffect(() => {
    if (page > totalPages) setPageState(totalPages);
  }, [page, totalPages]);

  const setPage = useCallback(
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
