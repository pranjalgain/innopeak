
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  type ConnectedLocation,
  ConnectionService,
  type ConnectionState,
} from "@/app/_libs/services/connection.service";
import { type ReviewPage, ReviewService } from "@/app/_libs/services/review.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import type { Review } from "@/types/domain";

import messages from "../../../../messages/en.json";
import { useReviewQueue } from "../use-review-queue";

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

/** Like `wrapper`, but hands back the `QueryClient` too — needed to simulate the Business
 *  Switcher's own direct cache write into `["connection"]`. */
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
  });

  test("isError is true and reviews is empty on a failed fetch — distinct from a genuinely empty result", async () => {
    // Regression: `placeholderData: keepPreviousData` only holds the previous page's rows while
    // the new fetch is still pending — once it settles as an error, `data` (and so `reviews`)
    // reverts to empty, indistinguishable from zero real matches unless a caller also checks
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
      // `total: 20` (2 pages at pageSize 10) — `setPage(2)` clamps back to 1 against an empty
      // result's `totalPages`, so the page-reset assertion below needs a real second page to move to.
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
});
