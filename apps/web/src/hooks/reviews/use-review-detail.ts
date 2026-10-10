
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ReviewService } from "@/app/_libs/services/review.service";
import type { Review } from "@/types/domain";

export const reviewQueryKey = (reviewId: string) => ["review", reviewId] as const;

interface UseReviewDetailResult {
  review: Review | null;
  isLoading: boolean;
  approveDraft: (draftId: string, content: string) => void;
  rejectDraft: (draftId: string) => void;
  postDraft: (draftId: string) => void;
  retryDraft: (draftId: string) => void;
  /** Replies the user asked to post whose outcome has not come back yet. */
  postingDraftIds: ReadonlySet<string>;
  /** Drafts whose approve/reject request has not come back yet (their cached state is optimistic). */
  decidingDraftIds: ReadonlySet<string>;
  createManualReply: (content: string) => Promise<boolean>;
  isCreatingManualReply: boolean;
}

/** Delivery is asynchronous (a queued job talks to Google), so after a decision the reply's
 *  outcome is polled for a short while rather than assumed. */
const POST_POLL_INTERVAL_MS = 3000;
const POST_POLL_MAX_ATTEMPTS = 10;
/** Right after an approve or a manual reply the screen cannot know whether auto-post will pick it
 *  up, so it watches briefly — long enough to catch an auto-post, short enough that a tenant with
 *  auto-post off is not polled for half a minute after every approval. */
const IMPLICIT_POLL_MAX_ATTEMPTS = 4;

type DecideAction =
  | { type: "approve"; draftId: string; content: string }
  | { type: "reject"; draftId: string };

/** Loads one review once, then owns approve/reject/post state locally. Approving finalizes the draft and supersedes pending siblings, since only one reply is posted per review. */
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
      // Merge the server's authoritative fields over the optimistic guess, but keep the draft's `label`: the response's is a
      // placeholder ("A") until the next `getReview` refetch.
      const current = queryClient.getQueryData<Review>(reviewQueryKey(reviewId));
      if (current) {
        queryClient.setQueryData<Review>(reviewQueryKey(reviewId), {
          ...current,
          replyDrafts: current.replyDrafts.map((draft) =>
            draft.id === updatedDraft.id ? { ...updatedDraft, label: draft.label } : draft,
          ),
        });
      }
      if (action.type === "approve") watch(updatedDraft.id, "implicit");
      toast.success(action.type === "approve" ? t("approved") : t("rejected"));
    },
    onError: (_error, _action, context) => {
      queryClient.setQueryData(reviewQueryKey(reviewId), context?.previous);
      toast.error(t("saveFailed"));
    },
  });

  // Draft ids whose delivery is being polled. `explicit` ones were queued by a Post/Retry click, so
  // the card shows "Posting…"; `implicit` ones were just approved and may or may not auto-post, so
  // the card stays actionable while the poll watches for a result.
  const [watching, setWatching] = useState<Record<string, "explicit" | "implicit">>({});
  const attempts = useRef<Record<string, number>>({});

  const watch = (draftId: string, mode: "explicit" | "implicit") => {
    attempts.current[draftId] = 0;
    setWatching((current) => ({ ...current, [draftId]: mode }));
  };

  // Read inside the poll without re-subscribing it: a draft can move from `implicit` to `explicit`
  // (the owner clicks Post while the approve-time poll is still running) without changing which
  // ids are watched.
  const watchingRef = useRef(watching);
  useEffect(() => {
    watchingRef.current = watching;
  }, [watching]);

  const watchedKey = Object.keys(watching).sort().join(",");
  useEffect(() => {
    if (!watchedKey) return;
    const ids = watchedKey.split(",");
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // A self-rescheduling timeout, not setInterval: one tick's requests finish before the next is
    // scheduled, so a slow connection can never run two ticks at once, double-count attempts and
    // fire duplicate toasts.
    const tick = async () => {
      const finished: string[] = [];
      for (const id of ids) {
        attempts.current[id] = (attempts.current[id] ?? 0) + 1;
        try {
          const outcome = await ReviewService.getPostStatus(reviewId, id);
          if (cancelled) return;
          if (outcome.status === "posted") {
            finished.push(id);
            toast.success(t("posted"));
          } else if (outcome.status === "post_failed") {
            finished.push(id);
            // The reason the backend recorded (e.g. the review was deleted on Google) beats a generic "retry".
            toast.error(
              outcome.errorMessage
                ? t("postFailedWithReason", { message: outcome.errorMessage })
                : t("postFailed"),
            );
          } else if (outcome.status !== "approved") {
            finished.push(id);
          }
        } catch {
          // One failed status request is a flaky connection, not an answer: it counts against the
          // attempt budget and the poll carries on, instead of dropping the draft back to an
          // enabled Post button while the job is still queued (and inviting a duplicate click).
        }
        const mode = watchingRef.current[id];
        const budget = mode === "explicit" ? POST_POLL_MAX_ATTEMPTS : IMPLICIT_POLL_MAX_ATTEMPTS;
        if (!finished.includes(id) && (attempts.current[id] ?? 0) >= budget) {
          finished.push(id);
          // The owner clicked Post and is owed an answer: say it is still in flight rather than let
          // the card silently revert. An implicit watch (just approved, may not auto-post) stays quiet.
          if (mode === "explicit") toast.info(t("postStillPending"));
        }
      }
      if (cancelled) return;
      if (finished.length > 0) {
        setWatching((current) => {
          const next = { ...current };
          for (const id of finished) delete next[id];
          return next;
        });
        void queryClient.invalidateQueries({ queryKey: reviewQueryKey(reviewId) });
      }
      // Anything still unfinished is polled again; finished ids drop out via the state update,
      // which re-runs this effect with the smaller set.
      if (finished.length < ids.length) {
        timer = setTimeout(() => void tick(), POST_POLL_INTERVAL_MS);
      }
    };

    timer = setTimeout(() => void tick(), POST_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `t` and `queryClient` are stable; the poll is driven by which ids are being watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedKey, reviewId]);

  const postMutation = useMutation({
    mutationFn: (action: { type: "post" | "retry"; draftId: string }) =>
      action.type === "post"
        ? ReviewService.postReply(reviewId, action.draftId)
        : ReviewService.retryPost(reviewId, action.draftId),
    onMutate: (action) => watch(action.draftId, "explicit"),
    onSuccess: () => toast.success(t("postQueued")),
    onError: (_error, action) => {
      setWatching((current) => {
        const next = { ...current };
        delete next[action.draftId];
        return next;
      });
      toast.error(t("postQueueFailed"));
    },
  });

  const manualReplyMutation = useMutation({
    mutationFn: (content: string) => ReviewService.createManualReply(reviewId, content),
    onSuccess: async (replyId) => {
      // A manual reply is created approved, so it may auto-post exactly like an approved draft.
      watch(replyId, "implicit");
      await queryClient.invalidateQueries({ queryKey: reviewQueryKey(reviewId) });
      toast.success(t("manualReplyCreated"));
    },
    onError: () => toast.error(t("saveFailed")),
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

  const postDraft = useCallback(
    (draftId: string) => postMutation.mutate({ type: "post", draftId }),
    [postMutation],
  );

  const retryDraft = useCallback(
    (draftId: string) => postMutation.mutate({ type: "retry", draftId }),
    [postMutation],
  );

  const createManualReply = useCallback(
    async (content: string) => {
      try {
        await manualReplyMutation.mutateAsync(content);
        return true;
      } catch {
        return false;
      }
    },
    [manualReplyMutation],
  );

  const postingDraftIds = new Set(
    Object.entries(watching)
      .filter(([, mode]) => mode === "explicit")
      .map(([id]) => id),
  );

  const decidingDraftIds = new Set<string>(
    decideMutation.isPending && decideMutation.variables ? [decideMutation.variables.draftId] : [],
  );

  return {
    review,
    isLoading: reviewQuery.isLoading,
    approveDraft,
    rejectDraft,
    postDraft,
    retryDraft,
    postingDraftIds,
    decidingDraftIds,
    createManualReply,
    isCreatingManualReply: manualReplyMutation.isPending,
  };
}
