import { useTranslations } from "next-intl";

import { cn } from "@/app/_libs/utils/cn";
import { Badge } from "@/components/ui/badge";
import type { EscalationReason } from "@/types/domain";

interface EscalationBadgeProps {
  reason: EscalationReason;
  short?: boolean;
  /** Let a long label wrap instead of truncating (a narrow table column in German). */
  wrap?: boolean;
  className?: string;
}

// A blocklist hit is a policy violation, so it ranks more severe than a low rating.
const REASON_BADGE_CLASSNAME: Record<EscalationReason, string> = {
  low_rating: "bg-warning-soft text-warning",
  blocklist_match: "bg-destructive-soft text-destructive",
};

export function EscalationBadge({ reason, short = false, wrap = false, className }: EscalationBadgeProps) {
  const t = useTranslations(short ? "common.escalationReasonShort" : "common.escalationReason");

  return (
    <Badge
      variant="outline"
      className={cn(
        "min-w-0 shrink border-transparent",
        // `truncate` and a wrapping `whitespace-*` are different Tailwind groups, so both survive a merge and the stylesheet order decides.
        wrap ? "break-words whitespace-normal" : "truncate",
        REASON_BADGE_CLASSNAME[reason],
        className,
      )}
    >
      {t(reason)}
    </Badge>
  );
}
