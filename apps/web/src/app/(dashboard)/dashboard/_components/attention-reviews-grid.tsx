import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { ROUTES } from "@/app/_libs/constants/routes";
import { EscalationBadge } from "@/components/common/escalation-badge";
import { StarRating } from "@/components/common/star-rating";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AttentionReview } from "@/types/domain";

interface AttentionReviewsGridProps {
  reviews: AttentionReview[];
}

export function AttentionReviewsGrid({ reviews }: AttentionReviewsGridProps) {
  const t = useTranslations("dashboard.attention");

  return (
    <div>
      <h2 className="mb-3 text-fluid-heading font-semibold">{t("title")}</h2>
      <div className="grid grid-cols-1 gap-fluid sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review, index) => (
          <Card
            key={review.id}
            className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500 ease-fluid"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
                    {review.initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{review.reviewerName}</p>
                  <StarRating rating={review.rating} />
                </div>
              </div>

              <p className="line-clamp-3 text-sm text-muted-foreground">{review.snippet}</p>

              <div className="flex min-w-0 items-center justify-between gap-2">
                <EscalationBadge reason={review.escalationReason} short className="py-1.5" />
                <Button asChild variant="secondary" size="sm" className="shrink-0">
                  <Link href={ROUTES.REVIEW_DETAIL(review.id) as Route}>{t("reviewCta")}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
