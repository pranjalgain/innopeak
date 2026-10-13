
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ReviewService } from "@/app/_libs/services/review.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import type { Review, ReviewReplyDraft } from "@/types/domain";

import messages from "../../../../messages/en.json";
import { useReviewDetail } from "../use-review-detail";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function draft(overrides: Partial<ReviewReplyDraft> = {}): ReviewReplyDraft {
  return {
    id: "draft-1",
    label: "Warm thanks",
    content: "Thanks so much!",
    originalContent: "Thanks so much!",
    status: "pending_approval",
    promptId: "prompt-1",
    promptVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    decidedAt: null,
    postedAt: null,
    errorMessage: null,
    ...overrides,
  };
}

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
    replyDrafts: [draft()],
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
    vi.restoreAllMocks();
    toast.error.mockClear();
    toast.success.mockClear();
  });

  /**
   * Regression: the success toast must wait for the mutation's `onSuccess`; otherwise a failed
   * persist showed "Approved"/"Rejected" before the `saveFailed` toast.
   */
  test("does not show a success toast when the background persist fails", async () => {
    const original = review();
    vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(original);
    vi.spyOn(ReviewService, "approveReply").mockRejectedValue(new Error("network error"));

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
    let resolvePersist!: (updated: ReviewReplyDraft) => void;
    vi.spyOn(ReviewService, "rejectReply").mockReturnValue(
      new Promise((resolve) => {
        resolvePersist = resolve;
      }),
    );

    const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.rejectDraft("draft-1");
    });

    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => {
      resolvePersist(draft({ status: "rejected", decidedAt: "2026-01-02T00:00:00.000Z" }));
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("rolls the optimistic write back when the background persist fails", async () => {
    // Regression: the hook writes into react-query's shared `["review", id]` cache, so a failed
    // persist that is not rolled back would leave a wrong "approved" status for every other reader.
    const original = review();
    vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(original);
    let rejectPersist!: (error: Error) => void;
    vi.spyOn(ReviewService, "approveReply").mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectPersist = reject;
      }),
    );

    const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.approveDraft("draft-1", "Thanks so much!");
    });

    await waitFor(() => expect(result.current.review?.replyDrafts[0]?.status).toBe("approved"));

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
    vi.spyOn(ReviewService, "rejectReply").mockImplementation((_reviewId, _responseId) =>
      Promise.resolve(draft({ status: "rejected", decidedAt: "2026-01-02T00:00:00.000Z" })),
    );

    const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.rejectDraft("draft-1");
    });

    await waitFor(() => expect(result.current.review?.replyDrafts[0]?.status).toBe("rejected"));

    // Stays rejected: nothing rolls a successful persist back.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.review?.replyDrafts[0]?.status).toBe("rejected");
  });

  test("a rollback restores the exact previous cache entry, not a guess", async () => {
    const original = review({ status: "in_review" });
    vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(original);
    vi.spyOn(ReviewService, "approveReply").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.approveDraft("draft-1", "Edited reply");
    });

    await waitFor(() => expect(result.current.review).toEqual(original));
  });

  describe("posting", () => {
    const approved = () =>
      review({
        replyDrafts: [draft({ status: "approved", decidedAt: "2026-01-02T00:00:00.000Z" })],
      });

    test("queues the post, marks the draft as posting, and reports the outcome once Google answers", async () => {
      vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(approved());
      const postReply = vi.spyOn(ReviewService, "postReply").mockResolvedValue();
      const getPostStatus = vi
        .spyOn(ReviewService, "getPostStatus")
        .mockResolvedValueOnce({ status: "approved", postedAt: null, errorMessage: null })
        .mockResolvedValue({
          status: "posted",
          postedAt: "2026-01-02T00:00:05.000Z",
          errorMessage: null,
        });

      const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        act(() => {
          result.current.postDraft("draft-1");
        });
        await waitFor(() => expect(postReply).toHaveBeenCalledWith("review-1", "draft-1"));
        expect(result.current.postingDraftIds.has("draft-1")).toBe(true);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });
        expect(result.current.postingDraftIds.has("draft-1")).toBe(true);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000);
        });
        await waitFor(() => expect(result.current.postingDraftIds.has("draft-1")).toBe(false));
        expect(getPostStatus).toHaveBeenCalledTimes(2);
        expect(toast.success).toHaveBeenCalledWith(messages.reviewDetail.toasts.posted);
      } finally {
        vi.useRealTimers();
      }
    });

    test("retry goes through the retry route, not the post route", async () => {
      vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(approved());
      const postReply = vi.spyOn(ReviewService, "postReply").mockResolvedValue();
      const retryPost = vi.spyOn(ReviewService, "retryPost").mockResolvedValue();
      vi.spyOn(ReviewService, "getPostStatus").mockResolvedValue({
        status: "approved",
        postedAt: null,
        errorMessage: null,
      });

      const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.retryDraft("draft-1");
      });

      await waitFor(() => expect(retryPost).toHaveBeenCalledWith("review-1", "draft-1"));
      expect(postReply).not.toHaveBeenCalled();
    });

    test("a post that could not be queued shows an error and clears the posting state", async () => {
      vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(approved());
      vi.spyOn(ReviewService, "postReply").mockRejectedValue(new Error("503"));

      const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.postDraft("draft-1");
      });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(messages.reviewDetail.toasts.postQueueFailed),
      );
      expect(result.current.postingDraftIds.size).toBe(0);
    });
  });

  describe("delivery polling", () => {
    const approved = () =>
      review({
        replyDrafts: [draft({ status: "approved", decidedAt: "2026-01-02T00:00:00.000Z" })],
      });

    /**
     * After an approve the screen cannot know whether auto-post will pick the reply up, so it
     * watches only briefly rather than 10 requests per approval for a tenant with auto-post off.
     */
    test("stops watching an approved reply that nothing is posting after a few polls", async () => {
      vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(
        review({ replyDrafts: [draft()] }),
      );
      vi.spyOn(ReviewService, "approveReply").mockResolvedValue(
        draft({ status: "approved", decidedAt: "2026-01-02T00:00:00.000Z" }),
      );
      const getPostStatus = vi
        .spyOn(ReviewService, "getPostStatus")
        .mockResolvedValue({ status: "approved", postedAt: null, errorMessage: null });

      const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        act(() => {
          result.current.approveDraft("draft-1", "Thanks so much!");
        });
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith(messages.reviewDetail.toasts.approved));

        for (let i = 0; i < 12; i++) {
          await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
          });
        }

        expect(getPostStatus).toHaveBeenCalledTimes(4);
      } finally {
        vi.useRealTimers();
      }
    });

    /** Regression: with setInterval, a poll slower than the interval ran two ticks at once. */
    test("never has two status requests in flight at once", async () => {
      vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(approved());
      vi.spyOn(ReviewService, "postReply").mockResolvedValue();
      let inFlight = 0;
      let maxInFlight = 0;
      vi.spyOn(ReviewService, "getPostStatus").mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 8000));
        inFlight -= 1;
        return { status: "approved", postedAt: null, errorMessage: null };
      });

      const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        act(() => {
          result.current.postDraft("draft-1");
        });
        for (let i = 0; i < 6; i++) {
          await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
          });
        }

        expect(maxInFlight).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    test("keeps polling through a failed status request instead of dropping back to an enabled Post", async () => {
      vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(approved());
      vi.spyOn(ReviewService, "postReply").mockResolvedValue();
      const getPostStatus = vi
        .spyOn(ReviewService, "getPostStatus")
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValue({
          status: "posted",
          postedAt: "2026-01-02T00:00:05.000Z",
          errorMessage: null,
        });

      const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        act(() => {
          result.current.postDraft("draft-1");
        });
        for (let i = 0; i < 4; i++) {
          await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
          });
        }

        expect(getPostStatus).toHaveBeenCalledTimes(2);
        expect(toast.success).toHaveBeenCalledWith(messages.reviewDetail.toasts.posted);
      } finally {
        vi.useRealTimers();
      }
    });

    test("tells the owner the post is still in flight when the poll budget runs out after a Post click", async () => {
      vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(approved());
      vi.spyOn(ReviewService, "postReply").mockResolvedValue();
      vi.spyOn(ReviewService, "getPostStatus").mockResolvedValue({
        status: "approved",
        postedAt: null,
        errorMessage: null,
      });

      const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        act(() => {
          result.current.postDraft("draft-1");
        });
        for (let i = 0; i < 14; i++) {
          await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
          });
        }

        expect(toast.info).toHaveBeenCalledWith(messages.reviewDetail.toasts.postStillPending);
      } finally {
        vi.useRealTimers();
      }
    });

    test("reports a draft as being decided while its approve request is in flight", async () => {
      vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(
        review({ replyDrafts: [draft()] }),
      );
      let resolveApprove!: (value: ReviewReplyDraft) => void;
      vi.spyOn(ReviewService, "approveReply").mockReturnValue(
        new Promise((resolve) => {
          resolveApprove = resolve;
        }),
      );
      vi.spyOn(ReviewService, "getPostStatus").mockResolvedValue({
        status: "posted",
        postedAt: "2026-01-02T00:00:05.000Z",
        errorMessage: null,
      });

      const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.approveDraft("draft-1", "Thanks so much!");
      });
      await waitFor(() => expect(result.current.decidingDraftIds.has("draft-1")).toBe(true));

      await act(async () => {
        resolveApprove(draft({ status: "approved", decidedAt: "2026-01-02T00:00:00.000Z" }));
      });
      await waitFor(() => expect(result.current.decidingDraftIds.size).toBe(0));
    });
  });

  describe("manual reply", () => {
    test("saves the reply and resolves true", async () => {
      vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(review({ replyDrafts: [] }));
      const create = vi.spyOn(ReviewService, "createManualReply").mockResolvedValue("reply-1");

      const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let saved = false;
      await act(async () => {
        saved = await result.current.createManualReply("Thanks for visiting!");
      });

      expect(saved).toBe(true);
      expect(create).toHaveBeenCalledWith("review-1", "Thanks for visiting!");
      expect(toast.success).toHaveBeenCalledWith(messages.reviewDetail.toasts.manualReplyCreated);
    });

    test("resolves false and shows an error when the save fails", async () => {
      vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(review({ replyDrafts: [] }));
      vi.spyOn(ReviewService, "createManualReply").mockRejectedValue(new Error("409"));

      const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let saved = true;
      await act(async () => {
        saved = await result.current.createManualReply("Thanks for visiting!");
      });

      expect(saved).toBe(false);
      expect(toast.error).toHaveBeenCalledWith(messages.reviewDetail.toasts.saveFailed);
    });

    test("two saves in the same instant send one request and one toast", async () => {
      vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(review({ replyDrafts: [] }));
      let release: (id: string) => void = () => undefined;
      const create = vi
        .spyOn(ReviewService, "createManualReply")
        .mockImplementation(() => new Promise<string>((resolve) => (release = resolve)));

      const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let first = false;
      let second = true;
      await act(async () => {
        const a = result.current.createManualReply("Thanks!");
        const b = result.current.createManualReply("Thanks!");
        // The mutation function starts a microtask later; the request must exist before it can be answered.
        await vi.waitFor(() => expect(create).toHaveBeenCalled());
        release("reply-1");
        [first, second] = await Promise.all([a, b]);
      });

      expect(create).toHaveBeenCalledTimes(1);
      expect([first, second]).toEqual([true, false]);
      expect(toast.success).toHaveBeenCalledTimes(1);
      expect(toast.error).not.toHaveBeenCalled();
    });

    test("a save can be retried after the first attempt failed", async () => {
      vi.spyOn(ReviewService, "getReviewById").mockResolvedValue(review({ replyDrafts: [] }));
      const create = vi
        .spyOn(ReviewService, "createManualReply")
        .mockRejectedValueOnce(new Error("500"))
        .mockResolvedValue("reply-1");

      const { result } = renderHook(() => useReviewDetail("review-1"), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.createManualReply("Thanks!");
      });
      let saved = false;
      await act(async () => {
        saved = await result.current.createManualReply("Thanks!");
      });

      expect(create).toHaveBeenCalledTimes(2);
      expect(saved).toBe(true);
    });
  });
});
