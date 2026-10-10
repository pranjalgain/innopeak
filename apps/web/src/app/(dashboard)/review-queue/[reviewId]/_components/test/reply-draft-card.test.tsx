import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import type { ReviewReplyDraft } from "@/types/domain";

import messages from "../../../../../../../messages/en.json";
import { ReplyDraftCard } from "../reply-draft-card";

const replies = messages.reviewDetail.replies;

function draft(overrides: Partial<ReviewReplyDraft> = {}): ReviewReplyDraft {
  return {
    id: "draft-1",
    label: "A",
    content: "Thanks for visiting!",
    originalContent: "Thanks for visiting!",
    status: "approved",
    promptId: "prompt-1",
    promptVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    decidedAt: "2026-01-02T00:00:00.000Z",
    postedAt: null,
    errorMessage: null,
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof ReplyDraftCard>> = {}) {
  const handlers = {
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onPost: vi.fn(),
    onRetry: vi.fn(),
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReplyDraftCard draft={draft()} isPosting={false} {...handlers} {...props} />
    </NextIntlClientProvider>,
  );
  return handlers;
}

describe("ReplyDraftCard delivery states", () => {
  test("an approved draft that has not been posted offers Post to Google", () => {
    const { onPost, onRetry } = renderCard();

    expect(screen.getByText(replies.confirmation.approved)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: replies.post }));

    expect(onPost).toHaveBeenCalledWith("draft-1");
    expect(onRetry).not.toHaveBeenCalled();
  });

  test("a posted draft shows it was posted and offers no action", () => {
    renderCard({ draft: draft({ postedAt: "2026-01-02T00:00:05.000Z" }) });

    expect(screen.getByText(replies.confirmation.posted)).toBeTruthy();
    expect(screen.queryByRole("button", { name: replies.post })).toBeNull();
    expect(screen.queryByRole("button", { name: replies.retryPost })).toBeNull();
  });

  test("a failed draft shows Google's reason and offers Retry, not Post", () => {
    const { onPost, onRetry } = renderCard({
      draft: draft({ errorMessage: "Google API returned 429 (quota exceeded)" }),
    });

    expect(screen.getByText(replies.confirmation.post_failed)).toBeTruthy();
    expect(screen.getByText(/Google API returned 429/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: replies.post })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: replies.retryPost }));
    expect(onRetry).toHaveBeenCalledWith("draft-1");
    expect(onPost).not.toHaveBeenCalled();
  });

  test("while a post is in flight the button is disabled and reads Posting…", () => {
    renderCard({ isPosting: true });

    const button = screen.getByRole("button", { name: replies.posting }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  test("a pending draft still offers approve/edit/reject and no delivery action", () => {
    renderCard({ draft: draft({ status: "pending_approval", decidedAt: null }) });

    expect(screen.getByRole("button", { name: replies.approve })).toBeTruthy();
    expect(screen.queryByRole("button", { name: replies.post })).toBeNull();
  });

  /** Regression: the optimistic cache says "approved" before the server agrees, so a Post click in
   *  that window was refused with a 409 and an error toast. */
  test("disables Post while the approve request is still in flight", () => {
    renderCard({ isDeciding: true });

    expect((screen.getByRole("button", { name: replies.post }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  test("offers no Retry when another reply is already live, and says why", () => {
    renderCard({
      draft: draft({ errorMessage: "Google API returned 429" }),
      canRetry: false,
    });

    expect(screen.queryByRole("button", { name: replies.retryPost })).toBeNull();
    expect(screen.getByText(replies.retryUnavailable)).toBeTruthy();
  });
});

describe("ReplyDraftCard on a review deleted on Google", () => {
  test("shows why the post failed but offers no retry", () => {
    renderCard({
      reviewRemoved: true,
      draft: draft({
        errorMessage: "This review was removed on Google, so the reply could not be posted.",
      }),
    });

    expect(screen.getByText(/This review was removed on Google/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: replies.retryPost })).toBeNull();
    expect(screen.queryByText(replies.retryUnavailable)).toBeNull();
  });

  test("offers no Post, Approve or Reject", () => {
    renderCard({ reviewRemoved: true });
    expect(screen.queryByRole("button", { name: replies.post })).toBeNull();

    renderCard({
      reviewRemoved: true,
      draft: draft({ status: "pending_approval", decidedAt: null }),
    });
    expect(screen.queryByRole("button", { name: replies.approve })).toBeNull();
    expect(screen.queryByRole("button", { name: replies.reject })).toBeNull();
  });
});
