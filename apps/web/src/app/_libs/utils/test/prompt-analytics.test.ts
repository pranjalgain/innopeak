import { describe, expect, test } from "vitest";

import type { Review, ReviewReplyDraft } from "@/types/domain";
import { computePromptVersionStats } from "../prompt-analytics";

function makeDraft(overrides: Partial<ReviewReplyDraft>): ReviewReplyDraft {
  return {
    id: "draft_1",
    label: "A",
    content: "Thanks for the feedback!",
    originalContent: "Thanks for the feedback!",
    status: "pending_approval",
    promptId: "prompt_positive",
    promptVersion: 1,
    createdAt: "2026-01-01T00:00:00Z",
    decidedAt: null,
    ...overrides,
  };
}

function makeReview(replyDrafts: ReviewReplyDraft[]): Review {
  return {
    id: "rev_1",
    reviewerName: "Test Reviewer",
    rating: 5,
    reviewText: "Great!",
    reviewedAt: "2026-01-01T00:00:00Z",
    classification: "auto_reply_candidate",
    escalationReason: null,
    status: "in_review",
    replyDrafts,
  };
}

describe("computePromptVersionStats", () => {
  test("returns all zeros and a null average when no drafts match", () => {
    const stats = computePromptVersionStats([], "prompt_positive");

    expect(stats.totalGenerated).toBe(0);
    expect(stats.approvedCount).toBe(0);
    expect(stats.averageDecisionMinutes).toBeNull();
  });

  test("only counts drafts for the given prompt id", () => {
    const reviews = [
      makeReview([makeDraft({ id: "a", promptId: "prompt_positive" })]),
      makeReview([makeDraft({ id: "b", promptId: "prompt_negative" })]),
    ];

    expect(computePromptVersionStats(reviews, "prompt_positive").totalGenerated).toBe(1);
    expect(computePromptVersionStats(reviews, "prompt_negative").totalGenerated).toBe(1);
  });

  test("when a version is given, only counts drafts from that version", () => {
    const reviews = [
      makeReview([
        makeDraft({ id: "a", promptVersion: 1 }),
        makeDraft({ id: "b", promptVersion: 2 }),
      ]),
    ];

    expect(computePromptVersionStats(reviews, "prompt_positive", 1).totalGenerated).toBe(1);
    expect(computePromptVersionStats(reviews, "prompt_positive").totalGenerated).toBe(2);
  });

  test("splits approved drafts into as-is vs edited by comparing content to originalContent", () => {
    const reviews = [
      makeReview([
        makeDraft({ id: "as-is", status: "approved", content: "Same text", originalContent: "Same text" }),
        makeDraft({ id: "edited", status: "approved", content: "Edited text", originalContent: "Original text" }),
      ]),
    ];

    const stats = computePromptVersionStats(reviews, "prompt_positive");

    expect(stats.approvedCount).toBe(2);
    expect(stats.approvedAsIsCount).toBe(1);
    expect(stats.approvedEditedCount).toBe(1);
  });

  test("counts rejected, pending, and superseded drafts separately from approved", () => {
    const reviews = [
      makeReview([
        makeDraft({ id: "a", status: "approved" }),
        makeDraft({ id: "b", status: "rejected" }),
        makeDraft({ id: "c", status: "pending_approval" }),
        makeDraft({ id: "d", status: "superseded" }),
      ]),
    ];

    const stats = computePromptVersionStats(reviews, "prompt_positive");

    expect(stats.totalGenerated).toBe(4);
    expect(stats.approvedCount).toBe(1);
    expect(stats.rejectedCount).toBe(1);
    expect(stats.pendingCount).toBe(1);
    expect(stats.supersededCount).toBe(1);
  });

  test("averages decision time in minutes only across decided drafts", () => {
    const reviews = [
      makeReview([
        makeDraft({
          id: "fast",
          status: "approved",
          createdAt: "2026-01-01T00:00:00Z",
          decidedAt: "2026-01-01T00:10:00Z", // 10 minutes
        }),
        makeDraft({
          id: "slow",
          status: "rejected",
          createdAt: "2026-01-01T00:00:00Z",
          decidedAt: "2026-01-01T00:30:00Z", // 30 minutes
        }),
        makeDraft({ id: "still-pending", status: "pending_approval", decidedAt: null }),
      ]),
    ];

    const stats = computePromptVersionStats(reviews, "prompt_positive");

    expect(stats.averageDecisionMinutes).toBe(20);
  });
});
