import { useTranslations } from "next-intl";

import type { PromptVersionStats } from "@/types/domain";

interface PromptVersionStatsLineProps {
  stats: PromptVersionStats;
}

/**
 * One line summarizing what actually happened to a prompt (version)'s
 * drafts — generated count, approval rate, how often owners had to edit
 * before approving, and average time-to-decision. Renders progressively:
 * no drafts yet, drafts but none decided, or a full breakdown.
 */
export function PromptVersionStatsLine({ stats }: PromptVersionStatsLineProps) {
  const t = useTranslations("promptManagement.stats");

  if (stats.totalGenerated === 0) {
    return <p className="text-xs text-muted-foreground">{t("noneGenerated")}</p>;
  }

  const decidedCount = stats.approvedCount + stats.rejectedCount;
  const parts: string[] = [t("totalGenerated", { count: stats.totalGenerated })];

  if (decidedCount > 0) {
    const approvalRate = Math.round((stats.approvedCount / decidedCount) * 100);
    parts.push(t("approvalRate", { rate: approvalRate }));

    if (stats.approvedCount > 0) {
      const editedRate = Math.round((stats.approvedEditedCount / stats.approvedCount) * 100);
      parts.push(t("editedRate", { rate: editedRate }));
    }
  } else {
    parts.push(t("awaitingReview"));
  }

  if (stats.averageDecisionMinutes !== null) {
    parts.push(t("avgDecisionTime", { minutes: Math.round(stats.averageDecisionMinutes) }));
  }

  return <p className="text-xs text-muted-foreground">{parts.join(" · ")}</p>;
}
