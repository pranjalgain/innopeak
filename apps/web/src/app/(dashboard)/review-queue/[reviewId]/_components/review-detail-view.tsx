"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { LuArrowLeft, LuSearch } from "react-icons/lu";

import { ManualReplyForm } from "@/app/(dashboard)/review-queue/[reviewId]/_components/manual-reply-form";
import { ReplyDraftCard } from "@/app/(dashboard)/review-queue/[reviewId]/_components/reply-draft-card";
import { ReviewSummaryCard } from "@/app/(dashboard)/review-queue/[reviewId]/_components/review-summary-card";
import { ROUTES } from "@/app/_libs/constants/routes";
import { getReplyDeliveryState } from "@/app/_libs/utils/reply-delivery";
import { BackLink } from "@/components/common/back-link";
import { ReviewStatusBadge } from "@/components/common/review-status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useReviewDetail } from "@/hooks/reviews/use-review-detail";

interface ReviewDetailViewProps {
  reviewId: string;
}

function ReviewDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-fluid-page">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function ReviewDetailView({ reviewId }: ReviewDetailViewProps) {
  const t = useTranslations("reviewDetail");
  const {
    review,
    isLoading,
    approveDraft,
    rejectDraft,
    postDraft,
    retryDraft,
    postingDraftIds,
    decidingDraftIds,
    createManualReply,
    isCreatingManualReply,
  } = useReviewDetail(reviewId);

  if (isLoading) return <ReviewDetailSkeleton />;

  if (!review) {
    return (
      <div className="p-fluid-page">
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center shadow-elevated">
          <LuSearch className="size-7 text-muted-foreground" />
          <p className="text-sm font-medium">{t("notFound")}</p>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link href={ROUTES.REVIEW_QUEUE}>
              <LuArrowLeft />
              {t("backToQueue")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const pendingCount = review.replyDrafts.filter(
    (draft) => draft.status === "pending_approval",
  ).length;
  // One live reply per review. "Live" is an approved draft whose posting has not *failed*: a failed post reads as
  // approved too but holds no live slot, so a reply Google keeps rejecting must not lock the owner out of writing their own.
  const hasLiveReply = review.replyDrafts.some((draft) => {
    const delivery = getReplyDeliveryState(draft);
    return delivery === "not_posted" || delivery === "posted";
  });
  const canWriteManualReply =
    review.status !== "responded" && review.status !== "dismissed" && !hasLiveReply;

  return (
    <div className="flex flex-col gap-6 p-fluid-page">
      <BackLink href={ROUTES.REVIEW_QUEUE} label={t("backToQueue")} />

      <div className="flex items-center gap-2">
        <span className="text-[13px] text-muted-foreground">{t("reviewStatusLabel")}</span>
        <ReviewStatusBadge status={review.status} />
      </div>

      <ReviewSummaryCard review={review} />

      {review.replyDrafts.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-fluid-heading font-semibold">{t("replies.title")}</h2>
            {pendingCount > 0 ? (
              <p className="text-[13px] text-muted-foreground">
                {pendingCount === 1
                  ? t("replies.descriptionOne")
                  : t("replies.descriptionMany", { count: pendingCount })}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {review.replyDrafts.map((draft, index) => (
              <div
                key={draft.id}
                className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards h-full duration-500 ease-fluid"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <ReplyDraftCard
                  draft={draft}
                  onApprove={approveDraft}
                  onReject={rejectDraft}
                  onPost={postDraft}
                  onRetry={retryDraft}
                  isPosting={postingDraftIds.has(draft.id)}
                  isDeciding={decidingDraftIds.has(draft.id)}
                  canRetry={!hasLiveReply}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {canWriteManualReply ? (
        <ManualReplyForm onSubmit={createManualReply} isSubmitting={isCreatingManualReply} />
      ) : null}
    </div>
  );
}
