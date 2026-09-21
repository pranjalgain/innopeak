import { useTranslations } from "next-intl";

import { cn } from "@/app/_libs/utils/cn";
import { Badge } from "@/components/ui/badge";
import type { ReviewStatus } from "@/types/domain";

interface ReviewStatusBadgeProps {
  status: ReviewStatus;
  /** See the identical prop on `ClassificationBadge` — same fixed-width-column wrapping need. */
  className?: string;
}

const CLASSNAME_BY_STATUS: Record<ReviewStatus, string> = {
  new: "border-border text-muted-foreground",
  in_review: "border-primary text-primary",
  responded: "border-transparent bg-success-soft text-success",
  dismissed: "border-transparent bg-destructive-soft text-destructive",
};

export function ReviewStatusBadge({ status, className }: ReviewStatusBadgeProps) {
  const t = useTranslations("common.reviewStatus");
  const label = t(status);

  return (
    <Badge variant="outline" className={cn(CLASSNAME_BY_STATUS[status], className)}>
      {label}
    </Badge>
  );
}
