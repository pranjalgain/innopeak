
import { focusManager, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  type ConnectedLocation,
  ConnectionService,
  type ConnectionState,
} from "@/app/_libs/services/connection.service";
import { type ReviewPage, ReviewService } from "@/app/_libs/services/review.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import { resetNavigation } from "@/test/mock-navigation";
import type { Review } from "@/types/domain";

import messages from "../../../../messages/en.json";
import { useReviewQueue } from "../use-review-queue";

vi.mock("next/navigation", async () => (await import("@/test/mock-navigation")).navigationMock);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function page(reviews: Review[], total = reviews.length): ReviewPage {
  return { reviews, total, page: 1, pageSize: 10, totalPages: Math.max(1, Math.ceil(total / 10)) };
}

function location(overrides: Partial<ConnectedLocation> = {}): ConnectedLocation {
  return {
    id: "loc-1",
    provider: "google",
    externalLocationId: "locations/1",
    businessName: "Downtown Store",
    address: null,
    status: "active",
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    onboardingBackfillCompletedAt: "2026-01-01T00:00:00.000Z",
    billingPausedAt: null,
    ...overrides,
  };
}

function connectionState(overrides: Partial<ConnectionState> = {}): ConnectionState {
  return {
    status: "connected",
    connectionId: "conn-1",
    providerAccountId: "accounts/1",
    connectedAt: "2026-01-01T00:00:00.000Z",
    location: location(),
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

/**
 * Also returns the `QueryClient`, to simulate the Business Switcher's direct cache write into
 * `["connection"]`.
 */
function renderWithClient() {
  const queryClient = createQueryClient();
  function withClient({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="en" messages={messages}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
  }
  return { queryClient, wrapper: withClient };
}

describe("useReviewQueue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetNavigation("/review-queue");
  });

  test("isError is true and reviews is empty on a failed fetch — distinct from a genuinely empty result", async () => {
    // Regression: `keepPreviousData` only holds old rows while the fetch is pending; on error
    // `reviews` reverts to empty, indistinguishable from zero matches unless a caller checks
    // `isError`.
    vi.spyOn(ReviewService, "getReviews").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useReviewQueue(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.reviews).toEqual([]);
  });

  test("retry re-issues the fetch", async () => {
    const getReviews = vi.spyOn(ReviewService, "getReviews");
    getReviews.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useReviewQueue(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    getReviews.mockResolvedValue(page([]));
    const callsBeforeRetry = getReviews.mock.calls.length;
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(getReviews.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  test("does not report isError once a fetch succeeds", async () => {
    vi.spyOn(ReviewService, "getReviews").mockResolvedValue(page([]));

    const { result } = renderHook(() => useReviewQueue(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(false);
  });

  describe("location scoping", () => {
    test("scopes the request to the active business", async () => {
      vi.spyOn(ConnectionService, "getState").mockResolvedValue(
        connectionState({ location: location({ id: "loc-1" }) }),
      );
      const getReviews = vi.spyOn(ReviewService, "getReviews").mockResolvedValue(page([]));

      renderHook(() => useReviewQueue(), { wrapper });

      await waitFor(() =>
        expect(getReviews).toHaveBeenCalledWith(expect.objectContaining({ locationId: "loc-1" })),
      );
    });

    test("switching the active business re-fetches under a new query key and resets to page 1", async () => {
      // `total: 20` (2 pages) so the page-reset assertion has a real second page: `setPage(2)`
      // clamps to 1 against an empty result's `totalPages`.
      const getReviews = vi.spyOn(ReviewService, "getReviews").mockResolvedValue(page([], 20));
      vi.spyOn(ConnectionService, "getState").mockResolvedValue(
        connectionState({ location: location({ id: "loc-1" }) }),
      );

      const { wrapper: clientWrapper, queryClient } = renderWithClient();
      const { result, rerender } = renderHook(() => useReviewQueue(), { wrapper: clientWrapper });

      await waitFor(() =>
        expect(getReviews).toHaveBeenCalledWith(expect.objectContaining({ locationId: "loc-1" })),
      );

      act(() => result.current.setPage(2));
      await waitFor(() =>
        expect(getReviews).toHaveBeenCalledWith(
          expect.objectContaining({ page: 2, locationId: "loc-1" }),
        ),
      );

      // Same direct cache write `useBusinessSwitcher` performs on a successful switch.
      queryClient.setQueryData(["connection"], connectionState({ location: location({ id: "loc-2" }) }));
      rerender();

      await waitFor(() =>
        expect(getReviews).toHaveBeenCalledWith(
          expect.objectContaining({ page: 1, locationId: "loc-2" }),
        ),
      );
    });
  });

  describe("URL state", () => {
    test("reads status, classification, search and page from the URL", async () => {
      resetNavigation("/review-queue?status=in_review&classification=escalated&q=late&page=2");
      const getReviews = vi.spyOn(ReviewService, "getReviews").mockResolvedValue(page([], 30));
      vi.spyOn(ConnectionService, "getState").mockResolvedValue(
        connectionState({ location: location({ id: "loc-1" }) }),
      );

      const { result } = renderHook(() => useReviewQueue(), { wrapper });

      await waitFor(() =>
        expect(getReviews).toHaveBeenCalledWith(
          expect.objectContaining({
            page: 2,
            filters: { status: "in_review", classification: "escalated", search: "late" },
            locationId: "loc-1",
          }),
        ),
      );
      expect(result.current.filters).toEqual({
        status: "in_review",
        classification: "escalated",
        search: "late",
      });
    });

    test("ignores a status or classification the queue does not offer", async () => {
      resetNavigation("/review-queue?status=bogus&classification=nope");
      vi.spyOn(ReviewService, "getReviews").mockResolvedValue(page([], 0));
      vi.spyOn(ConnectionService, "getState").mockResolvedValue(
        connectionState({ location: location() }),
      );

      const { result } = renderHook(() => useReviewQueue(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.filters.status).toBe("all");
      expect(result.current.filters.classification).toBe("all");
    });

    test("a deep link to page 3 survives the active business being resolved", async () => {
      resetNavigation("/review-queue?page=3");
      const getReviews = vi.spyOn(ReviewService, "getReviews").mockResolvedValue(page([], 40));
      vi.spyOn(ConnectionService, "getState").mockResolvedValue(
        connectionState({ location: location({ id: "loc-1" }) }),
      );

      renderHook(() => useReviewQueue(), { wrapper });

      await waitFor(() =>
        expect(getReviews).toHaveBeenCalledWith(
          expect.objectContaining({ page: 3, locationId: "loc-1" }),
        ),
      );
      expect(window.location.search).toBe("?page=3");
    });

    test("choosing a filter writes it to the URL and drops the page", async () => {
      resetNavigation("/review-queue?page=2");
      vi.spyOn(ReviewService, "getReviews").mockResolvedValue(page([], 30));
      vi.spyOn(ConnectionService, "getState").mockResolvedValue(
        connectionState({ location: location() }),
      );
      const { result } = renderHook(() => useReviewQueue(), { wrapper });
      await waitFor(() => expect(result.current.page).toBe(2));

      act(() => result.current.setStatus("removed"));

      await waitFor(() => expect(window.location.search).toBe("?status=removed"));
      act(() => result.current.setStatus("all"));
      await waitFor(() => expect(window.location.search).toBe(""));
    });

    test("paging adds a history entry, so Back returns to the previous page", async () => {
      vi.spyOn(ReviewService, "getReviews").mockResolvedValue(page([], 30));
      vi.spyOn(ConnectionService, "getState").mockResolvedValue(
        connectionState({ location: location() }),
      );
      const { result } = renderHook(() => useReviewQueue(), { wrapper });
      await waitFor(() => expect(result.current.totalPages).toBe(3));

      act(() => result.current.goToNextPage());
      await waitFor(() => expect(result.current.page).toBe(2));
      act(() => window.history.back());

      await waitFor(() => expect(result.current.page).toBe(1));
    });
  });
});

/** New reviews arrive in the background, so the queue refreshes itself when the window is focused again. */
describe("useReviewQueue — staying current", () => {
  const T0 = new Date("2026-06-01T10:00:00Z").getTime();
  const returnToWindow = () => {
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    resetNavigation("/review-queue");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectionState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("does not refetch when the window is refocused within a minute", async () => {
    const getReviews = vi.spyOn(ReviewService, "getReviews").mockResolvedValue(page([]));
    const { wrapper: withClient } = renderWithClient();
    renderHook(() => useReviewQueue(), { wrapper: withClient });
    await waitFor(() => expect(getReviews).toHaveBeenCalledTimes(1));

    vi.setSystemTime(T0 + 30_000);
    returnToWindow();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getReviews).toHaveBeenCalledTimes(1);
  });

  test("refetches when the window is refocused after a minute", async () => {
    const getReviews = vi.spyOn(ReviewService, "getReviews").mockResolvedValue(page([]));
    const { wrapper: withClient } = renderWithClient();
    renderHook(() => useReviewQueue(), { wrapper: withClient });
    await waitFor(() => expect(getReviews).toHaveBeenCalledTimes(1));

    vi.setSystemTime(T0 + 61_000);
    returnToWindow();

    await waitFor(() => expect(getReviews).toHaveBeenCalledTimes(2));
  });

  // Replacing a list the person is reading with an error screen because a refocus refetch failed would be worse than slightly old rows.
  test("keeps the rows and reports no error when a background refresh fails", async () => {
    const getReviews = vi.spyOn(ReviewService, "getReviews").mockResolvedValueOnce(page([{ id: "r1" } as Review], 1));
    const { wrapper: withClient } = renderWithClient();
    const { result } = renderHook(() => useReviewQueue(), { wrapper: withClient });
    await waitFor(() => expect(result.current.reviews).toHaveLength(1));

    getReviews.mockRejectedValue(new Error("offline"));
    vi.setSystemTime(T0 + 61_000);
    returnToWindow();
    await waitFor(() => expect(getReviews).toHaveBeenCalledTimes(2));

    expect(result.current.isError).toBe(false);
    expect(result.current.reviews).toHaveLength(1);
  });
});

