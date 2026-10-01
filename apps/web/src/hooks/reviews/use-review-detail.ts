
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { ReviewService } from "@/app/_libs/services/review.service";
import type { Review } from "@/types/domain";

export const reviewQueryKey = (reviewId: string) => ["review", reviewId] as const;

interface UseReviewDetailResult {
  review: Review | null;
  isLoading: boolean;
  approveDraft: (draftId: string, content: string) => void;
  rejectDraft: (draftId: string) => void;
}

type DecideAction =
  | { type: "approve"; draftId: string; content: string }
  | { type: "reject"; draftId: string };

/**
 * Loads one review once, then owns the approve/reject state locally —
 * approving a draft finalizes its (possibly edited) content and supersedes
 * any sibling draft still pending approval, since only one reply can ever
 * be posted per review. Persists to the real `POST .../approve`/`.../reject`
 * endpoints. Load failures and approve/reject outcomes surface via toast.
 */
export function useReviewDetail(reviewId: string): UseReviewDetailResult {
  const t = useTranslations("reviewDetail.toasts");
  const queryClient = useQueryClient();

  const reviewQuery = useQuery({
    queryKey: reviewQueryKey(reviewId),
    queryFn: () => ReviewService.getReviewById(reviewId),
  });

  useEffect(() => {
    if (reviewQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewQuery.isError]);

  // Callbacks live on the mutation itself, not on the individual `mutate()` call — per-call ones
  // are dropped when a second `mutate()` supersedes the first on the same observer (approve then
  // reject in quick succession), which lost both the first call's toast and its rollback.
  const decideMutation = useMutation({
    mutationFn: (action: DecideAction) =>
      action.type === "approve"
        ? ReviewService.approveReply(reviewId, action.draftId, action.content)
        : ReviewService.rejectReply(reviewId, action.draftId),
    onMutate: (action) => {
      const previous = queryClient.getQueryData<Review>(reviewQueryKey(reviewId));
      if (previous) {
        const decidedAt = new Date().toISOString();
        queryClient.setQueryData<Review>(reviewQueryKey(reviewId), {
          ...previous,
          replyDrafts: previous.replyDrafts.map((draft) => {
            if (draft.id === action.draftId) {
              return action.type === "approve"
                ? { ...draft, content: action.content, status: "approved", decidedAt }
                : { ...draft, status: "rejected", decidedAt };
            }
            // Approving one draft decides every other still-pending sibling's fate too.
            if (action.type === "approve" && draft.status === "pending_approval") {
              return { ...draft, status: "superseded", decidedAt };
            }
            return draft;
          }),
        });
      }
      return { previous };
    },
    onSuccess: (updatedDraft, action) => {
      // Merge the server's authoritative fields (status/content/decidedAt) into the cache,
      // replacing the optimistic guess — but keep the draft's own `label`, since the server
      // response's own `label` is a placeholder ("A") the next full `getReview` refetch corrects,
      // not a real re-derivation of this one draft's position among its siblings.
      const current = queryClient.getQueryData<Review>(reviewQueryKey(reviewId));
      if (current) {
        queryClient.setQueryData<Review>(reviewQueryKey(reviewId), {
          ...current,
          replyDrafts: current.replyDrafts.map((draft) =>
            draft.id === updatedDraft.id ? { ...updatedDraft, label: draft.label } : draft,
          ),
        });
      }
      toast.success(action.type === "approve" ? t("approved") : t("rejected"));
    },
    onError: (_error, _action, context) => {
      queryClient.setQueryData(reviewQueryKey(reviewId), context?.previous);
      toast.error(t("saveFailed"));
    },
  });

  const review = reviewQuery.data ?? null;

  const approveDraft = useCallback(
    (draftId: string, content: string) => {
      decideMutation.mutate({ type: "approve", draftId, content });
    },
    [decideMutation],
  );

  const rejectDraft = useCallback(
    (draftId: string) => {
      decideMutation.mutate({ type: "reject", draftId });
    },
    [decideMutation],
  );

  return { review, isLoading: reviewQuery.isLoading, approveDraft, rejectDraft };
}
