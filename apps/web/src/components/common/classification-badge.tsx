import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { ReviewClassification } from "@/types/domain";

interface ClassificationBadgeProps {
  classification: ReviewClassification | null;
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
export function ClassificationBadge({ classification }: ClassificationBadgeProps) {
  const t = useTranslations("common.classification");
  const key = classification ?? "unclassified";

  return (
    <Badge variant="outline" className={CLASSNAME_BY_CLASSIFICATION[key]}>
      {t(key === "pending_classification" ? "unclassified" : key)}
    </Badge>
  );
}
