import type { Route } from "next";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

import { ROUTES } from "@/app/_libs/constants/routes";
import { ClassificationBadge } from "@/components/common/classification-badge";
import { ReviewStatusBadge } from "@/components/common/review-status-badge";
import { StarRating } from "@/components/common/star-rating";
import type { Review } from "@/types/domain";

interface ReviewCardListProps {
  reviews: Review[];
}

const DATE_FORMAT = { month: "short", day: "numeric" } as const;

/**
 * Mobile/narrow-viewport counterpart to `ReviewTable` — the design switches
 * from a table to a card list below the tablet breakpoint rather than
 * squeezing table columns, so both are rendered and toggled with responsive
 * visibility classes (see `review-results.tsx`).
 */
export function ReviewCardList({ reviews }: ReviewCardListProps) {
  const t = useTranslations("reviewQueue");
  const format = useFormatter();
  const tEscalation = useTranslations("common.escalationReason");

  return (
    <div className="flex flex-col gap-3">
      {reviews.map((review, index) => (
        <Link
          key={review.id}
          href={ROUTES.REVIEW_DETAIL(review.id) as Route}
          className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 shadow-elevated duration-500 ease-fluid"
          style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold">{review.reviewerName}</span>
            <StarRating rating={review.rating} className="shrink-0" />
          </div>

          <p className="text-[13px] text-muted-foreground">{review.reviewText}</p>

          <div className="flex flex-wrap gap-1.5">
            <ClassificationBadge classification={review.classification} />
            {review.escalationReason ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-warning px-2.5 py-0.5 text-xs font-medium text-warning">
                {tEscalation(review.escalationReason)}
              </span>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t border-border pt-2.5 text-[13px]">
            <span className="text-muted-foreground">{t("columns.status")}</span>
            <ReviewStatusBadge status={review.status} />
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">{t("columns.date")}</span>
            <span>{format.dateTime(new Date(review.reviewedAt), DATE_FORMAT)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
