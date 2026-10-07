import type { ReplyDeliveryState, ReviewReplyDraft } from "@/types/domain";

/** Where an approved reply stands with Google. The API folds `posted` and `post_failed` into `approved`, so the delivery timestamps/errors tell them apart; `null` for non-approved drafts. */
export function getReplyDeliveryState(
  draft: Pick<ReviewReplyDraft, "status" | "postedAt" | "errorMessage">,
): ReplyDeliveryState | null {
  if (draft.status !== "approved") return null;
  if (draft.postedAt) return "posted";
  if (draft.errorMessage) return "failed";
  return "not_posted";
}
