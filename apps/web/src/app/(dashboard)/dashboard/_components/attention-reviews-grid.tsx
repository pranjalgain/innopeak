import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LuArrowRight } from "react-icons/lu";

import { ROUTES } from "@/app/_libs/constants/routes";
import { cn } from "@/app/_libs/utils/cn";
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

  // Nothing needs attention — an empty "Needs your attention" heading over a blank grid is worse
  // than no section at all, so this collapses away entirely rather than showing a hollow header.
  if (reviews.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-fluid-heading font-semibold">{t("title")}</h2>
      <div className="grid grid-cols-1 gap-fluid sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review, index) => (
          <Card
            key={review.id}
            className={cn(
              "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500 ease-fluid",
              // A blocklist hit gets a stronger visual cue than the badge alone — a low rating's
              // badge is enough signal on its own.
              review.escalationReason === "blocklist_match" && "border-l-4 border-l-destructive",
            )}
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
                {review.escalationReason ? (
                  <EscalationBadge reason={review.escalationReason} short className="py-1.5" />
                ) : (
                  // Empty span, not nothing: `justify-between` needs a first child or the CTA
                  // slides left and the card stops lining up with its neighbours.
                  <span />
                )}
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <Link href={ROUTES.REVIEW_DETAIL(review.id) as Route}>
                    {t("reviewCta")}
                    <LuArrowRight />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
