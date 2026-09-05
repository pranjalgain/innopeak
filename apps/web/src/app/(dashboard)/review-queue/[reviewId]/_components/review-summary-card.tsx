import { useTranslations } from "next-intl";

import { getInitials } from "@/app/_libs/utils/initials";
import { ClassificationBadge } from "@/components/common/classification-badge";
import { StarRating } from "@/components/common/star-rating";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import type { Review } from "@/types/domain";

interface ReviewSummaryCardProps {
  review: Review;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export function ReviewSummaryCard({ review }: ReviewSummaryCardProps) {
  const tEscalationShort = useTranslations("common.escalationReasonShort");

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarFallback className="bg-secondary text-sm font-semibold text-secondary-foreground">
                {getInitials(review.reviewerName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-base font-semibold">{review.reviewerName}</p>
              <div className="mt-1 flex items-center gap-2">
                <StarRating rating={review.rating} />
                <span className="text-[13px] text-muted-foreground">
                  {DATE_FORMATTER.format(new Date(review.reviewedAt))}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ClassificationBadge classification={review.classification} />
            {review.escalationReason ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-transparent bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning">
                {tEscalationShort(review.escalationReason)}
              </span>
            ) : null}
          </div>
        </div>

        <p className="text-sm leading-relaxed">{review.reviewText}</p>
      </CardContent>
    </Card>
  );
}
