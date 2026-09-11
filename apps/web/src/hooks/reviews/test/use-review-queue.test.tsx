
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { type ReviewPage, ReviewService } from "@/app/_libs/services/review.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import type { Review } from "@/types/domain";

import messages from "../../../../messages/en.json";
import { useReviewQueue } from "../use-review-queue";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function page(reviews: Review[], total = reviews.length): ReviewPage {
  return { reviews, total, page: 1, pageSize: 10, totalPages: Math.max(1, Math.ceil(total / 10)) };
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

describe("useReviewQueue", () => {
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
});
