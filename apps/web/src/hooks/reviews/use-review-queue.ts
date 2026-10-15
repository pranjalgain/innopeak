
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ReviewService } from "@/app/_libs/services/review.service";
import { liveQueryOptions } from "@/app/_libs/utils/query-client";
import { parseChoiceParam, useUrlQueryState } from "@/hooks/common/use-url-query-state";
import { useUrlSearchPage } from "@/hooks/common/use-url-search-page";
import { useConnection } from "@/hooks/connections/use-connection";
import type {
  Review,
  ReviewClassification,
  ReviewQueueFilters,
  ReviewStatus,
} from "@/types/domain";

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

const STATUS_VALUES: readonly ReviewStatus[] = [
  "new",
  "in_review",
  "responded",
  "dismissed",
  "removed",
];
const CLASSIFICATION_VALUES: readonly ReviewClassification[] = [
  "auto_reply_candidate",
  "escalated",
];

/** A filter value from the URL, or `"all"` when it is missing or not one the queue offers (a stale or hand-edited link). */
function filterFromUrl<T extends string>(raw: string | null, allowed: readonly T[]): T | "all" {
  return parseChoiceParam(raw, allowed) ?? "all";
}

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
  // Filters, search and page live in the URL (`?status=new&q=term&page=2`), so Back/Forward and a reload keep your place.
  const { searchParams, update } = useUrlQueryState();
  const status = filterFromUrl(searchParams.get("status"), STATUS_VALUES);
  const classification = filterFromUrl(searchParams.get("classification"), CLASSIFICATION_VALUES);
  // Only `search` is debounced. The two dropdowns are discrete choices a user makes once, so
  // delaying them would just feel unresponsive.
  const {
    search,
    setSearch,
    debouncedSearch,
    page,
    setPage: setPageInUrl,
    clampPage,
  } = useUrlSearchPage(SEARCH_DEBOUNCE_MS);
  const filters: ReviewQueueFilters = { status, classification, search };

  // Switching business invalidates the current page (page 3 may not exist for the other one). The first resolution of the
  // active location (none known yet -> some) is not a switch: a deep link to page 3 must survive it.
  const lastLocationId = useRef<string | null>(null);
  useEffect(() => {
    if (
      lastLocationId.current !== null &&
      locationId !== null &&
      lastLocationId.current !== locationId
    ) {
      update({ page: null });
    }
    if (locationId !== null) lastLocationId.current = locationId;
  }, [locationId, update]);

  const queryParams: ReviewQueueQueryParams = {
    page,
    pageSize: PAGE_SIZE,
    filters: {
      status,
      classification,
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
    // New reviews arrive in the background: refresh after a minute and when the window is focused again.
    ...liveQueryOptions,
  });

  // `isLoadingError`, not `isError`: a background refresh that fails (a focus refetch while offline) keeps the rows already on screen,
  // so it must neither toast nor swap the list for the error state.
  useEffect(() => {
    if (reviewsQuery.isLoadingError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewsQuery.isLoadingError]);

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
    (next: number) => setPageInUrl(Math.min(Math.max(next, 1), totalPages)),
    [setPageInUrl, totalPages],
  );

  // A stale `?page=` (an old link, a list that shrank) is pulled back to the last real page.
  useEffect(() => {
    if (reviewsQuery.data) clampPage(totalPages);
  }, [reviewsQuery.data, totalPages, clampPage]);

  return {
    reviews: reviewsQuery.data?.reviews ?? [],
    filters,
    // A new filter can leave the current page out of range, so it always starts again from page 1.
    setStatus: (next) => update({ status: next === "all" ? null : next, page: null }),
    setClassification: (next) =>
      update({ classification: next === "all" ? null : next, page: null }),
    setSearch,
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
    isError: reviewsQuery.isLoadingError,
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
