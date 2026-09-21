import { useTranslations } from "next-intl";

import { cn } from "@/app/_libs/utils/cn";
import { Badge } from "@/components/ui/badge";
import type { ReviewClassification } from "@/types/domain";

interface ClassificationBadgeProps {
  classification: ReviewClassification | null;
  /**
   * Merged in after the classification's own colour classes — for a caller in a fixed-width
   * container to bound the label instead of letting it spill past its box. `ReviewTable` is
   * the reason this exists: its `table-fixed` columns don't grow for overflow the way an
   * `auto`-layout table would, and a translated classification label can still be wider than
   * the column it sits in. It passes `max-w-full whitespace-normal break-words` so the label
   * **wraps** — deliberately
   * not `truncate`, which hid half the text behind an ellipsis; classification is information
   * someone is meant to read, not decoration.
   */
  className?: string;
}

const CLASSNAME_BY_CLASSIFICATION: Record<ReviewClassification, string> = {
  auto_reply_candidate: "border-transparent bg-success-soft text-success",
  escalated: "border-transparent bg-warning-soft text-warning",
  unclassified: "border-border text-muted-foreground",
  pending_classification: "border-border text-muted-foreground",
};

/**
 * A review's classification chip. `unclassified`/`pending_classification`/
 * `null` all render as "Unclassified" — same as the design's own
 * `classificationInfo()` fallback.
 */
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
