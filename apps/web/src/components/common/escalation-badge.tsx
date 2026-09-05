import { useTranslations } from "next-intl";

import { cn } from "@/app/_libs/utils/cn";
import { Badge } from "@/components/ui/badge";
import type { EscalationReason } from "@/types/domain";

interface EscalationBadgeProps {
  reason: EscalationReason;
  /** Drops the "Escalated ·" prefix for tight layouts where that context is already obvious. */
  short?: boolean;
  className?: string;
}

export function EscalationBadge({ reason, short = false, className }: EscalationBadgeProps) {
  const t = useTranslations(short ? "common.escalationReasonShort" : "common.escalationReason");

  return (
    <Badge
      variant="outline"
      className={cn("min-w-0 shrink truncate border-transparent bg-warning-soft text-warning", className)}
    >
      {t(reason)}
    </Badge>
  );
}
