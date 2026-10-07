
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ReviewService } from "@/app/_libs/services/review.service";
import { useDebouncedValue } from "@/hooks/common/use-debounced-value";
import { useConnection } from "@/hooks/connections/use-connection";
import type { Review, ReviewQueueFilters } from "@/types/domain";

interface UseReviewQueueResult {
  reviews: Review[];
  filters: ReviewQueueFilters;
  setStatus: (status: ReviewQueueFilters["status"]) => void;
  setClassification: (classification: ReviewQueueFilters["classification"]) => void;
  setSearch: (search: string) => void;
  isLoading: boolean;
  /** `reviews` is `[]` for a failed fetch too, so check this before the "no results" empty state, which would mislead. */
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
  locationId: string | null;
}

export const reviewQueueQueryKey = (params: ReviewQueueQueryParams) =>
  ["reviews", "queue", params] as const;

/** The review queue, paginated server-side. Scoped to the active business and folded into the query key, so switching location reads as a different query rather than serving one business's rows under another's key. */
export function useReviewQueue(): UseReviewQueueResult {
  const t = useTranslations("reviewQueue.toasts");
  const { state, isLoading: isResolvingLocation } = useConnection();
  const locationId = state?.location?.id ?? null;
  const [page, setPageState] = useState(1);
  const [filters, setFilters] = useState<ReviewQueueFilters>(INITIAL_FILTERS);
  // Only `search` is debounced. The two dropdowns are discrete choices a user makes once, so
  // delaying them would just feel unresponsive.
  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS);

  // A filter or business change invalidates the current page (page 3 may not exist in the new set), so reset it before the
  // query params change. Adjusted during render, not in an effect: an effect runs after the render, which would already
  // have issued `page=3&locationId=<new>` and, with `keepPreviousData`, shown the previous business's rows briefly.
  const paramsKey = `${filters.status}|${filters.classification}|${debouncedSearch}|${locationId ?? ""}`;
  const [lastParamsKey, setLastParamsKey] = useState(paramsKey);
  if (lastParamsKey !== paramsKey) {
    setLastParamsKey(paramsKey);
    setPageState(1);
  }

  const queryParams: ReviewQueueQueryParams = {
    page,
    pageSize: PAGE_SIZE,
    filters: {
      status: filters.status,
      classification: filters.classification,
      search: debouncedSearch,
    },
    locationId,
  };

  const reviewsQuery = useQuery({
    queryKey: reviewQueueQueryKey(queryParams),
    queryFn: () => ReviewService.getReviews({ ...queryParams, locationId: locationId ?? undefined }),
    // Waits for `["connection"]` to settle, same as the dashboard's queries: a null `locationId`
    // means "every location" to the API, so firing before the active one is known lists the whole
    // tenant's reviews and then replaces them.
    enabled: !isResolvingLocation,
    // Keeps the previous page's rows on screen while the next loads, instead of flashing empty.
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (reviewsQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewsQuery.isError]);

  // Which business's rows are safe to show. `keepPreviousData` keeps the previous business's rows with `isLoading` false
  // during a switch's refetch, and `switchTo` writes `["connection"]` via `setQueryData`, so `isResolvingLocation` never
  // catches it. Updates only once the query settles for the current `locationId`, so it lags exactly while that fetch runs.
  const [committedLocationId, setCommittedLocationId] = useState<string | null>(null);
  useEffect(() => {
    if (!reviewsQuery.isFetching) {
      setCommittedLocationId(locationId);
    }
  }, [reviewsQuery.isFetching, locationId]);
  const isSwitchingBusiness = locationId !== committedLocationId;

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
    // First load only (no cached data): `isFetching` also flips on every page/filter change, and the view swaps its whole
    // content area to a skeleton while this is true; `keepPreviousData` already covers those. `isResolvingLocation` counts
    // as loading since the query is `enabled: false` until then. `isSwitchingBusiness && isFetching` covers what `isLoading`
    // alone misses (see `committedLocationId`).
    isLoading:
      isResolvingLocation ||
      reviewsQuery.isLoading ||
      (isSwitchingBusiness && reviewsQuery.isFetching),
    // `keepPreviousData` only holds rows while pending; once settled as an error, `reviews` reverts to empty, indistinguishable
    // from a genuinely empty result unless the caller checks this.
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
