
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

/**
 * Loads one review once, then owns the approve/reject state locally —
 * approving a draft finalizes its (possibly edited) content and supersedes
 * any sibling draft still pending approval, since only one reply can ever
 * be posted per review. Persists in the background via a mock full-resource
 * PUT, same pattern as `useSettings`. Load failures and approve/reject
 * outcomes surface via toast.
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

  // Fire-and-forget, same as the original `void ReviewService.updateReview(next)` — approve/reject
  // stay synchronous, void-returning calls rather than becoming `Promise`-returning like
  // `useSettings.saveGeneral`. But unlike a plain `useState`, a failed write here now sits in
  // react-query's shared cache for the rest of its 5-minute staleTime, visible to any other reader
  // of this same query key — so a failure has to roll the optimistic write back, not just go
  // unnoticed until the next remount.
  // Callbacks live on the mutation itself, not on the individual `mutate()` call — per-call ones
  // are dropped when a second `mutate()` supersedes the first on the same observer (approve then
  // reject in quick succession), which lost both the first call's toast and its rollback.
  const updateMutation = useMutation({
    mutationFn: ({ next }: { next: Review; successMessage: string }) =>
      ReviewService.updateReview(next),
    onMutate: ({ next }) => {
      const previous = queryClient.getQueryData<Review>(reviewQueryKey(reviewId));
      queryClient.setQueryData(reviewQueryKey(reviewId), next);
      return { previous };
    },
    onSuccess: (_data, { successMessage }) => toast.success(successMessage),
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(reviewQueryKey(reviewId), context?.previous);
      toast.error(t("saveFailed"));
    },
  });

  const persist = useCallback(
    (next: Review, successMessage: string) => {
      updateMutation.mutate({ next, successMessage });
    },
    [updateMutation],
  );

  const review = reviewQuery.data ?? null;

  const approveDraft = useCallback(
    (draftId: string, content: string) => {
      if (!review) return;
      const decidedAt = new Date().toISOString();
      persist(
        {
          ...review,
          replyDrafts: review.replyDrafts.map((draft) => {
            if (draft.id === draftId) return { ...draft, content, status: "approved", decidedAt };
            // A sibling's approval decides this draft's fate too — timestamp it the same way.
            if (draft.status === "pending_approval")
              return { ...draft, status: "superseded", decidedAt };
            return draft;
          }),
        },
        t("approved"),
      );
    },
    [review, persist, t],
  );

  const rejectDraft = useCallback(
    (draftId: string) => {
      if (!review) return;
      persist(
        {
          ...review,
          replyDrafts: review.replyDrafts.map((draft) =>
            draft.id === draftId
              ? { ...draft, status: "rejected", decidedAt: new Date().toISOString() }
              : draft,
          ),
        },
        t("rejected"),
      );
    },
    [review, persist, t],
  );

  return { review, isLoading: reviewQuery.isLoading, approveDraft, rejectDraft };
}
