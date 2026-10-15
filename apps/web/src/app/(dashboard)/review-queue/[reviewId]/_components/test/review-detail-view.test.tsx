import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useReviewDetail } from "@/hooks/reviews/use-review-detail";
import type { Review, ReviewReplyDraft } from "@/types/domain";

import messages from "../../../../../../../messages/en.json";
import { ReviewDetailView } from "../review-detail-view";

vi.mock("@/hooks/reviews/use-review-detail", () => ({ useReviewDetail: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function draft(overrides: Partial<ReviewReplyDraft>): ReviewReplyDraft {
  return {
    id: "draft-1",
    label: "A",
    content: "Thanks!",
    originalContent: "Thanks!",
    status: "approved",
    source: "ai_generated",
    promptId: "p",
    promptVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    decidedAt: "2026-01-02T00:00:00.000Z",
    postedAt: null,
    errorMessage: null,
    ...overrides,
  };
}

function review(replyDrafts: ReviewReplyDraft[], status: Review["status"] = "in_review"): Review {
  return {
    id: "review-1",
    reviewerName: "Jamie",
    rating: 4,
    reviewText: "Nice",
    reviewedAt: "2026-01-01T00:00:00.000Z",
    classification: "auto_reply_candidate",
    escalationReason: null,
    status,
    replyDrafts,
  };
}

function show(value: Review) {
  vi.mocked(useReviewDetail).mockReturnValue({
    review: value,
    isLoading: false,
    approveDraft: vi.fn(),
    rejectDraft: vi.fn(),
    postDraft: vi.fn(),
    retryDraft: vi.fn(),
    postingDraftIds: new Set(),
    decidingDraftIds: new Set(),
    createManualReply: vi.fn(),
    isCreatingManualReply: false,
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReviewDetailView reviewId="review-1" />
    </NextIntlClientProvider>,
  );
}

const manualTitle = messages.reviewDetail.replies.manual.title;

describe("ReviewDetailView — manual reply availability", () => {
  beforeEach(() => vi.clearAllMocks());

  test("offers the form when there are only pending drafts", () => {
    show(review([draft({ status: "pending_approval", decidedAt: null })]));

    expect(screen.getByText(manualTitle)).toBeTruthy();
  });

  test("withholds it once a reply is live (approved and not failed)", () => {
    show(review([draft({})]));

    expect(screen.queryByText(manualTitle)).toBeNull();
  });

  /** Regression: the API reports a failed post as approved, so a reply Google kept rejecting hid
   *  the form and left Retry as the only option. */
  test("offers it when the only approved reply has failed to post", () => {
    show(review([draft({ errorMessage: "Google API returned 429" })]));

    expect(screen.getByText(manualTitle)).toBeTruthy();
  });

  test("withholds it on a review deleted on Google, and says why", () => {
    show(review([draft({ status: "pending_approval", decidedAt: null })], "removed"));

    expect(screen.queryByText(manualTitle)).toBeNull();
    expect(screen.getByText(messages.reviewDetail.removedNotice)).toBeTruthy();
    expect(screen.queryByRole("button", { name: messages.reviewDetail.replies.approve })).toBeNull();
  });

  test("withholds it on a responded or dismissed review", () => {
    show(review([], "dismissed"));

    expect(screen.queryByText(manualTitle)).toBeNull();
  });

  describe("draft layout", () => {
    const pending = (id: string, label: string) =>
      draft({ id, label, status: "pending_approval", decidedAt: null });
    const gridOf = () => screen.getByText("Snippet A").closest(".grid");

    test.each([
      ["a lone draft", [pending("d1", "A")]],
      ["two drafts", [pending("d1", "A"), pending("d2", "B")]],
      ["an odd number of drafts", [pending("d1", "A"), pending("d2", "B"), pending("d3", "C")]],
    ])("lays out %s in a two-column grid, every card the same half width", (_label, drafts) => {
      show(review(drafts));

      // No card is stretched across both columns, so an odd one out sits at half width like the rest.
      expect(gridOf()).toHaveClass("md:grid-cols-2");
      expect(gridOf()?.className).not.toContain("col-span-2");
    });

    test("keeps the drafts and the manual reply form in separate containers", () => {
      show(review([pending("d1", "A")]));

      const draftsContainer = screen
        .getByRole("heading", { name: "Suggested replies" })
        .closest("[data-slot=card]");
      const manualContainer = screen.getByText(manualTitle).closest("[data-slot=card]");

      expect(draftsContainer).not.toBeNull();
      expect(draftsContainer).not.toBe(manualContainer);
      expect(draftsContainer?.contains(screen.getByText("Snippet A"))).toBe(true);
      expect(draftsContainer?.contains(screen.getByText(manualTitle))).toBe(false);
      expect(manualContainer?.contains(screen.getByText("Snippet A"))).toBe(false);
    });
  });
});
