import { useFormatter } from "next-intl";

import { getInitials } from "@/app/_libs/utils/initials";
import { ClassificationBadge } from "@/components/common/classification-badge";
import { EscalationBadge } from "@/components/common/escalation-badge";
import { StarRating } from "@/components/common/star-rating";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { useReviewerName } from "@/hooks/common/use-reviewer-name";
import type { Review } from "@/types/domain";

interface ReviewSummaryCardProps {
  review: Review;
}

const DATE_FORMAT = { month: "short", day: "numeric", year: "numeric" } as const;

export function ReviewSummaryCard({ review }: ReviewSummaryCardProps) {
  const format = useFormatter();
  const reviewerName = useReviewerName();
  const name = reviewerName(review.reviewerName);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarFallback className="bg-secondary text-sm font-semibold text-secondary-foreground">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-base font-semibold break-words">{name}</p>
              <div className="mt-1 flex items-center gap-2">
                <StarRating rating={review.rating} />
                <span className="text-[13px] text-muted-foreground">
                  {format.dateTime(new Date(review.reviewedAt), DATE_FORMAT)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ClassificationBadge classification={review.classification} />
            {review.escalationReason ? (
              <EscalationBadge reason={review.escalationReason} short />
            ) : null}
          </div>
        </div>

        <p className="text-sm leading-relaxed break-words">{review.reviewText}</p>
      </CardContent>
    </Card>
  );
}
