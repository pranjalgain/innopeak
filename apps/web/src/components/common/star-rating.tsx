import { useTranslations } from "next-intl";
import { LuStar } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";

interface StarRatingProps {
  rating: number;
  className?: string;
}

/**
 * A row of 5 stars, filled up to `rating`. Used anywhere a review's rating
 * is shown (Dashboard, and later Review Queue / Review Detail).
 */
export function StarRating({ rating, className }: StarRatingProps) {
  const t = useTranslations("common");

  return (
    <div className={cn("flex items-center gap-0.5", className)} aria-label={t("starRatingAriaLabel", { rating })}>
      {[1, 2, 3, 4, 5].map((star) => (
        <LuStar
          key={star}
          className={star <= rating ? "text-warning" : "text-muted-foreground/40"}
          fill={star <= rating ? "currentColor" : "none"}
          size={14}
        />
      ))}
    </div>
  );
}
