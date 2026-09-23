"use client";


import { useTranslations } from "next-intl";
import { useState } from "react";
import { LuMessageSquareText, LuSparkles, LuThumbsUp } from "react-icons/lu";


import { PromptEditorDialog } from "@/app/(dashboard)/settings/prompts/_components/prompt-editor-dialog";
import { PromptList } from "@/app/(dashboard)/settings/prompts/_components/prompt-list";
import { ROUTES } from "@/app/_libs/constants/routes";
import { getCurrentVersion } from "@/app/_libs/utils/prompt";
import { BackLink } from "@/components/common/back-link";
import { Skeleton } from "@/components/ui/skeleton";
import { usePromptAnalytics } from "@/hooks/prompts/use-prompt-analytics";
import { usePrompts } from "@/hooks/prompts/use-prompts";

function PromptManagementSkeleton() {
  return (
    <div className="p-fluid-page flex flex-col gap-6">
      <div>
        <Skeleton className="mb-3 h-4 w-32" />
        <Skeleton className="h-8 w-56" />
      </div>
      <div className="flex max-w-3xl gap-4">
        <Skeleton className="h-16 flex-1 rounded-xl" />
        <Skeleton className="h-16 flex-1 rounded-xl" />
        <Skeleton className="h-16 flex-1 rounded-xl" />
      </div>
      <div className="flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}

interface SummaryStatProps {
  icon: typeof LuSparkles;
  label: string;
  value: string;
}

function SummaryStat({ icon: Icon, label, value }: SummaryStatProps) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-elevated">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold tabular-nums">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function PromptManagementView() {
  const t = useTranslations("promptManagement");
  const { prompts, isLoading, isSaving, saveNewVersion, updateTone } = usePrompts();
  const { getStats, isLoading: isLoadingStats } = usePromptAnalytics(prompts);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingPrompt = prompts.find((prompt) => prompt.id === editingId) ?? null;

  if (isLoading || isLoadingStats) return <PromptManagementSkeleton />;

  // Rolled up across every prompt's *current* version only — history entries have their own
  // stats shown inline where they're already relevant, this is meant as "how am I doing right
  // now," not a lifetime total across every version ever edited.
  const aggregate = prompts.reduce(
    (totals, prompt) => {
      const current = getCurrentVersion(prompt);
      const stats = getStats(prompt.id, current.version);
      return {
        totalGenerated: totals.totalGenerated + stats.totalGenerated,
        approvedCount: totals.approvedCount + stats.approvedCount,
        rejectedCount: totals.rejectedCount + stats.rejectedCount,
      };
    },
    { totalGenerated: 0, approvedCount: 0, rejectedCount: 0 },
  );
  const decidedCount = aggregate.approvedCount + aggregate.rejectedCount;
  const approvalRate = decidedCount > 0 ? Math.round((aggregate.approvedCount / decidedCount) * 100) : null;

  return (
    <div className="p-fluid-page flex flex-col gap-6">
      <div>
        <BackLink href={ROUTES.SETTINGS} label={t("backToSettings")} className="mb-3" />
        <h1 className="text-fluid-title font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>

      {prompts.length > 0 && (
        <div className="flex max-w-3xl flex-wrap gap-3">
          <SummaryStat
            icon={LuSparkles}
            label={t("summary.prompts", { count: prompts.length })}
            value={String(prompts.length)}
          />
          <SummaryStat
            icon={LuMessageSquareText}
            label={t("summary.totalGenerated")}
            value={String(aggregate.totalGenerated)}
          />
          <SummaryStat
            icon={LuThumbsUp}
            label={t("summary.approvalRate")}
            value={approvalRate === null ? "—" : `${approvalRate}%`}
          />
        </div>
      )}

      <div className="max-w-3xl">
        <PromptList
          prompts={prompts}
          onEdit={setEditingId}
          onToneChange={updateTone}
          getStats={getStats}
        />
      </div>

      <PromptEditorDialog
        prompt={editingPrompt}
        isSaving={isSaving}
        onSaveVersion={saveNewVersion}
        onClose={() => setEditingId(null)}
      />
    </div>
  );
}
