
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ReviewService } from "@/app/_libs/services/review.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import type { Review } from "@/types/domain";

import messages from "../../../../messages/en.json";
import { useReviewDetail } from "../use-review-detail";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: "review-1",
    reviewerName: "Jamie",
    rating: 5,
    reviewText: "Loved it",
    reviewedAt: "2026-01-01T00:00:00.000Z",
    classification: null,
    escalationReason: null,
    status: "new",
    replyDrafts: [
      {
        id: "draft-1",
        label: "Warm thanks",
        content: "Thanks so much!",
        originalContent: "Thanks so much!",
        status: "pending_approval",
        promptId: "prompt-1",
        promptVersion: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        decidedAt: null,
      },
    ],
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

describe("useReviewDetail", () => {
  beforeEach(() => {
    toast.error.mockClear();
    toast.success.mockClear();
  });

  /**
   * Regression: `approveDraft`/`rejectDraft` used to call `toast.success` unconditionally, right
   * after kicking off the background persist — so a persist that went on to fail still showed
   * "Approved"/"Rejected" a moment before the real `saveFailed` error toast. The fix moves the
   * success toast into the mutation's own `onSuccess`, so it only fires once the write actually
   * confirms.
   */
  test("does not show a success toast when the background persist fails", async () => {
    const original = review();
    vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(original);
    vi.spyOn(ReviewService, "updateReview").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.approveDraft("draft-1", "Thanks so much!");
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
  });

  test("shows the success toast only once the background persist actually succeeds", async () => {
    const original = review();
    vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(original);
    let resolvePersist!: (next: Review) => void;
    vi.spyOn(ReviewService, "updateReview").mockReturnValue(
      new Promise((resolve) => {
        resolvePersist = resolve;
      }),
    );

    const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.rejectDraft("draft-1");
    });

    // The optimistic write already applied, but the persist hasn't settled yet.
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => {
      resolvePersist({ ...original, replyDrafts: result.current.review?.replyDrafts ?? [] });
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("rolls the optimistic write back when the background persist fails", async () => {
    // Regression: this hook writes straight into react-query's shared `["review", id]` cache
    // (5-minute staleTime), not local component state — a failed persist that isn't rolled back
    // would leave the wrong "approved" status sitting there for any other reader of the same
    // query key, not just this component.
    const original = review();
    vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(original);
    let rejectPersist!: (error: Error) => void;
    vi.spyOn(ReviewService, "updateReview").mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectPersist = reject;
      }),
    );

    const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.approveDraft("draft-1", "Thanks so much!");
    });

    // The optimistic write applies before the background persist has even settled.
    await waitFor(() => expect(result.current.review?.replyDrafts[0]?.status).toBe("approved"));

    // ...then rolls back once it rejects.
    await act(async () => {
      rejectPersist(new Error("network error"));
    });
    await waitFor(() =>
      expect(result.current.review?.replyDrafts[0]?.status).toBe("pending_approval"),
    );
  });

  test("keeps the optimistic write when the background persist succeeds", async () => {
    const original = review();
    vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(original);
    vi.spyOn(ReviewService, "updateReview").mockImplementation((next) => Promise.resolve(next));

    const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.rejectDraft("draft-1");
    });

    await waitFor(() => expect(result.current.review?.replyDrafts[0]?.status).toBe("rejected"));

    // Stays rejected — nothing rolls a successful persist back.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.review?.replyDrafts[0]?.status).toBe("rejected");
  });

  test("a rollback restores the exact previous cache entry, not a guess", async () => {
    const original = review({ status: "in_review" });
    vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(original);
    vi.spyOn(ReviewService, "updateReview").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.approveDraft("draft-1", "Edited reply");
    });

    await waitFor(() => expect(result.current.review).toEqual(original));
  });
});
