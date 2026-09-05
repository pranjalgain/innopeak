import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { ReviewService } from "@/app/_libs/services/review.service";
import type { Review } from "@/types/domain";

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
  const [review, setReview] = React.useState<Review | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    ReviewService.getReviewById(reviewId)
      .then((result) => {
        if (!cancelled) setReview(result);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reviewId, t]);

  const persist = React.useCallback((next: Review) => {
    setReview(next);
    void ReviewService.updateReview(next);
  }, []);

  const approveDraft = React.useCallback(
    (draftId: string, content: string) => {
      if (!review) return;
      const decidedAt = new Date().toISOString();
      persist({
        ...review,
        replyDrafts: review.replyDrafts.map((draft) => {
          if (draft.id === draftId) return { ...draft, content, status: "approved", decidedAt };
          // A sibling's approval decides this draft's fate too — timestamp it the same way.
          if (draft.status === "pending_approval") return { ...draft, status: "superseded", decidedAt };
          return draft;
        }),
      });
      toast.success(t("approved"));
    },
    [review, persist, t],
  );

  const rejectDraft = React.useCallback(
    (draftId: string) => {
      if (!review) return;
      persist({
        ...review,
        replyDrafts: review.replyDrafts.map((draft) =>
          draft.id === draftId ? { ...draft, status: "rejected", decidedAt: new Date().toISOString() } : draft,
        ),
      });
      toast.success(t("rejected"));
    },
    [review, persist, t],
  );

  return { review, isLoading, approveDraft, rejectDraft };
}
