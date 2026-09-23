import { useTranslations } from "next-intl";

import { cn } from "@/app/_libs/utils/cn";
import type { PromptVersionStats } from "@/types/domain";

interface PromptVersionStatsLineProps {
  stats: PromptVersionStats;
}

function StatChip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "muted" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
        tone === "success" && "bg-success-soft text-success",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "neutral" && "bg-secondary text-secondary-foreground",
      )}
    >
      {label}
    </span>
  );
}

/**
 * What actually happened to a prompt (version)'s drafts — generated count, approval rate, how
 * often owners had to edit before approving, and average time-to-decision — as small stat chips
 * rather than one run-on sentence, so each figure reads as its own data point. Renders
 * progressively: no drafts yet, drafts but none decided, or a full breakdown.
 */
export function PromptVersionStatsLine({ stats }: PromptVersionStatsLineProps) {
  const t = useTranslations("promptManagement.stats");

  if (stats.totalGenerated === 0) {
    return <StatChip label={t("noneGenerated")} tone="muted" />;
  }

  const decidedCount = stats.approvedCount + stats.rejectedCount;
  const chips: { label: string; tone?: "neutral" | "success" | "muted" }[] = [
    { label: t("totalGenerated", { count: stats.totalGenerated }) },
  ];

  if (decidedCount > 0) {
    const approvalRate = Math.round((stats.approvedCount / decidedCount) * 100);
    chips.push({ label: t("approvalRate", { rate: approvalRate }), tone: "success" });

    if (stats.approvedCount > 0) {
      const editedRate = Math.round((stats.approvedEditedCount / stats.approvedCount) * 100);
      chips.push({ label: t("editedRate", { rate: editedRate }) });
    }
  } else {
    chips.push({ label: t("awaitingReview"), tone: "muted" });
  }

  if (stats.averageDecisionMinutes !== null) {
    chips.push({ label: t("avgDecisionTime", { minutes: Math.round(stats.averageDecisionMinutes) }) });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <StatChip key={chip.label} label={chip.label} tone={chip.tone} />
      ))}
    </div>
  );
}
