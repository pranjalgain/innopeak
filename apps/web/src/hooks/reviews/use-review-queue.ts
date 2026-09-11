
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
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
  /**
   * A failed fetch for the current page/filters — `reviews` is `[]` in this case too, same as a
   * genuinely empty result set, so a caller must check this before rendering the "no results, try
   * clearing your filters" empty state: that copy is actively misleading for a request that never
   * reached the server.
   */
  isError: boolean;
  retry: () => void;
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

interface ReviewQueueQueryParams {
  page: number;
  pageSize: number;
  filters: { status: ReviewQueueFilters["status"]; classification: ReviewQueueFilters["classification"]; search: string };
}

export const reviewQueueQueryKey = (params: ReviewQueueQueryParams) =>
  ["reviews", "queue", params] as const;

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
  const [page, setPageState] = useState(1);
  const [filters, setFilters] = useState<ReviewQueueFilters>(INITIAL_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Only `search` is debounced. The two dropdowns are discrete choices a user makes once, so
  // delaying them would just feel unresponsive.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // A filter change invalidates the current page — page 3 of "escalated" may not exist once the
  // status filter narrows the result set. Reset before the query params below change, rather than
  // fetching page 3 of the new set and only then discovering it's empty.
  useEffect(() => {
    setPageState(1);
  }, [filters.status, filters.classification, debouncedSearch]);

  const queryParams: ReviewQueueQueryParams = {
    page,
    pageSize: PAGE_SIZE,
    filters: {
      status: filters.status,
      classification: filters.classification,
      search: debouncedSearch,
    },
  };

  const reviewsQuery = useQuery({
    queryKey: reviewQueueQueryKey(queryParams),
    queryFn: () => ReviewService.getReviews(queryParams),
    // Keeps the previous page's rows on screen while the next page loads, instead of the list
    // flashing empty on every click — matches the original hook, which never cleared `reviews`
    // before a new fetch resolved.
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (reviewsQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewsQuery.isError]);

  const total = reviewsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setPage = useCallback(
    (next: number) => setPageState(Math.min(Math.max(next, 1), totalPages)),
    [totalPages],
  );

  return {
    reviews: reviewsQuery.data?.reviews ?? [],
    filters,
    setStatus: (status) => setFilters((prev) => ({ ...prev, status })),
    setClassification: (classification) => setFilters((prev) => ({ ...prev, classification })),
    setSearch: (search) => setFilters((prev) => ({ ...prev, search })),
    // `isFetching`, not `isLoading`: the original set its loading flag around every fetch,
    // including a page/filter change once data already exists, not just the very first load
    // (which is all `isLoading` alone would cover once `placeholderData` keeps `data` defined).
    isLoading: reviewsQuery.isFetching,
    // `keepPreviousData` only holds the prior page's rows while this one is still *pending* — once
    // the fetch actually settles as an error, `data` (and so `reviews` above) reverts to empty,
    // indistinguishable from a genuinely empty result set unless the caller also checks this.
    isError: reviewsQuery.isError,
    retry: () => {
      void reviewsQuery.refetch();
    },
    total,
    page,
    totalPages,
    setPage,
    goToPreviousPage: () => setPage(page - 1),
    goToNextPage: () => setPage(page + 1),
  };
}
