import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { ReviewStatus } from "@/types/domain";

interface ReviewStatusBadgeProps {
  status: ReviewStatus;
}

const CLASSNAME_BY_STATUS: Record<ReviewStatus, string> = {
  new: "border-border text-muted-foreground",
  in_review: "border-primary text-primary",
  responded: "border-transparent bg-success-soft text-success",
  dismissed: "border-transparent bg-destructive-soft text-destructive",
};

export function ReviewStatusBadge({ status }: ReviewStatusBadgeProps) {
  const t = useTranslations("common.reviewStatus");

  return (
    <Badge variant="outline" className={CLASSNAME_BY_STATUS[status]}>
      {t(status)}
    </Badge>
  );
}
