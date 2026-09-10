import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ReviewService } from "@/app/_libs/services/review.service";
import type { Review, ReviewQueueFilters } from "@/types/domain";

interface UseReviewQueueResult {
  reviews: Review[];
  filters: ReviewQueueFilters;
  setStatus: (status: ReviewQueueFilters["status"]) => void;
  setClassification: (classification: ReviewQueueFilters["classification"]) => void;
  setSearch: (search: string) => void;
  isLoading: boolean;
  total: number;
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  goToPreviousPage: () => void;
  goToNextPage: () => void;
}

const INITIAL_FILTERS: ReviewQueueFilters = {
  status: "all",
  classification: "all",
  search: "",
};

/** Matches the page the list actually renders — pagination is server-side, not a display slice. */
const PAGE_SIZE = 10;

/** Typing pause before a search reaches the API — long enough that a word is one request, not six. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The review queue, paginated **server-side**.
 *
 * An earlier version fetched one 50-row batch and re-sliced it into pages of 6 in the browser via
 * `usePagination` — clicking "Next" just re-sliced the array already in memory, so it never
 * reflected the backend's own `page`/`total`, and a business with more than 50 reviews would never
 * show anything past row 50 no matter how many times "Next" was clicked. This fetches exactly the
 * page being displayed, using `GET /v1/reviews`'s own `page`/`pageSize`/`meta.total`.
 */
export function useReviewQueue(): UseReviewQueueResult {
  const t = useTranslations("reviewQueue.toasts");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [filters, setFilters] = useState<ReviewQueueFilters>(INITIAL_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Only `search` is debounced. The two dropdowns are discrete choices a user makes once, so
  // delaying them would just feel unresponsive.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // A filter change invalidates the current page — page 3 of "escalated" may not exist once the
  // status filter narrows the result set. Reset before the fetch below runs for the new filters,
  // rather than fetching page 3 of the new set and only then discovering it's empty.
  useEffect(() => {
    setPageState(1);
  }, [filters.status, filters.classification, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    ReviewService.getReviews({
      page,
      pageSize: PAGE_SIZE,
      filters: {
        status: filters.status,
        classification: filters.classification,
        search: debouncedSearch,
      },
    })
      .then((result) => {
        if (cancelled) return;
        setReviews(result.reviews);
        setTotal(result.total);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, filters.status, filters.classification, debouncedSearch, t]);

  const setPage = useCallback(
    (next: number) => setPageState(Math.min(Math.max(next, 1), totalPages)),
    [totalPages],
  );

  return {
    reviews,
    filters,
    setStatus: (status) => setFilters((prev) => ({ ...prev, status })),
    setClassification: (classification) => setFilters((prev) => ({ ...prev, classification })),
    setSearch: (search) => setFilters((prev) => ({ ...prev, search })),
    isLoading,
    total,
    page,
    totalPages,
    setPage,
    goToPreviousPage: () => setPage(page - 1),
    goToNextPage: () => setPage(page + 1),
  };
}
