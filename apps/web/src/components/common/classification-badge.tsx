import { useTranslations } from "next-intl";

import { cn } from "@/app/_libs/utils/cn";
import { Badge } from "@/components/ui/badge";
import type { ReviewClassification } from "@/types/domain";

interface ClassificationBadgeProps {
  classification: ReviewClassification | null;
  /** Lets a fixed-width caller (`ReviewTable`'s `table-fixed` columns) wrap the label instead of `truncate`, which hid half the text. */
  className?: string;
}

const CLASSNAME_BY_CLASSIFICATION: Record<ReviewClassification, string> = {
  auto_reply_candidate: "border-transparent bg-success-soft text-success",
  escalated: "border-transparent bg-warning-soft text-warning",
  unclassified: "border-border text-muted-foreground",
  pending_classification: "border-border text-muted-foreground",
};

/** `unclassified`, `pending_classification` and `null` all render as "Unclassified". */
export function ClassificationBadge({ classification, className }: ClassificationBadgeProps) {
  const t = useTranslations("common.classification");
  const key = classification ?? "unclassified";
  const label = t(key === "pending_classification" ? "unclassified" : key);

  return (
    <Badge variant="outline" className={cn(CLASSNAME_BY_CLASSIFICATION[key], className)}>
      {label}
    </Badge>
  );
}
