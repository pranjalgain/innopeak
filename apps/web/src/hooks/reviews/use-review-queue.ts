
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
  locationId: string | null;
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
 *
 * Scoped to whichever business the Business Switcher currently has active (`useConnection()`'s
 * `state.location.id`). Folded into the query key, not just the request: switching the active
 * location must read as a different query to react-query, not a background refetch of the same
 * one, otherwise a page change or the debounce timer racing the switch could serve one business's
 * rows under a key that now means another.
 */
export function useReviewQueue(): UseReviewQueueResult {
  const t = useTranslations("reviewQueue.toasts");
  const { state, isLoading: isResolvingLocation } = useConnection();
  const locationId = state?.location?.id ?? null;
  const [page, setPageState] = useState(1);
  const [filters, setFilters] = useState<ReviewQueueFilters>(INITIAL_FILTERS);
  // Only `search` is debounced. The two dropdowns are discrete choices a user makes once, so
  // delaying them would just feel unresponsive.
  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS);

  // A filter change invalidates the current page — page 3 of "escalated" may not exist once the
  // status filter narrows the result set, and the same is true of switching business: page 3 of
  // one location's reviews may not exist for another. Reset before the query params below change,
  // rather than fetching page 3 of the new set and only then discovering it's empty.
  //
  // Adjusted during render, not in an effect. An effect runs *after* the render it belongs to, so
  // the render that first saw the new location had already built `queryParams` with the old page
  // and issued `page=3&locationId=<new>` — a wasted round trip, and with `keepPreviousData` the
  // list visibly showed the previous business's rows with a wrong total before settling. React
  // re-runs this render immediately on the set, without committing the first one.
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
    // Keeps the previous page's rows on screen while the next page loads, instead of the list
    // flashing empty on every click — matches the original hook, which never cleared `reviews`
    // before a new fetch resolved.
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (reviewsQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewsQuery.isError]);

  // Tracks which business's rows are actually safe to show. `keepPreviousData` keeps the PREVIOUS
  // business's rows on screen (as placeholder data) with `reviewsQuery.isLoading` false throughout
  // a business switch's in-flight refetch — and `switchTo` (`useBusinessSwitcher`) writes the new
  // location straight into `["connection"]`'s cache via `setQueryData`, never a real fetch, so
  // `isResolvingLocation` never catches it either. Without this, switching businesses could show
  // one business's reviews under another's active context with zero loading indicator. This only
  // updates once the query actually settles (success or error) for the CURRENT `locationId`, so it
  // stays out of step with `locationId` for exactly as long as that business's fetch is in flight —
  // never during a same-business search/filter/page change, where `locationId` itself never moves.
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
    // The genuine first load only (no cached data yet) — `reviewsQuery.isFetching` also flips true
    // on every page/filter change once data already exists, and the view swaps its *entire*
    // content area (rows AND the pagination footer) to a full skeleton whenever this is true.
    // `placeholderData: keepPreviousData` already keeps the previous page's rows (and `total`, so
    // `totalPages` doesn't dip either) on screen while the next page/filter's fetch is in flight,
    // so a background refetch needs no loading state of its own here. `isResolvingLocation` still
    // counts as loading — the query is `enabled: false` until then, so it would never report
    // `isLoading` on its own, and the queue would otherwise flash its empty state while the active
    // location is still being resolved. `isSwitchingBusiness && reviewsQuery.isFetching` covers the
    // one case `reviewsQuery.isLoading` alone misses — see `committedLocationId`'s own comment.
    isLoading:
      isResolvingLocation ||
      reviewsQuery.isLoading ||
      (isSwitchingBusiness && reviewsQuery.isFetching),
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
