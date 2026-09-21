"use client";


import { useTranslations } from "next-intl";
import { useState } from "react";


import { PromptEditorDialog } from "@/app/(dashboard)/settings/prompts/_components/prompt-editor-dialog";
import { PromptList } from "@/app/(dashboard)/settings/prompts/_components/prompt-list";
import { ROUTES } from "@/app/_libs/constants/routes";
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
      <div className="flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function PromptManagementView() {
  const t = useTranslations("promptManagement");
  const { prompts, isLoading, isSaving, saveNewVersion, updateTone } = usePrompts();
  const { getStats, isLoading: isLoadingStats } = usePromptAnalytics();
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingPrompt = prompts.find((prompt) => prompt.id === editingId) ?? null;

  if (isLoading || isLoadingStats) return <PromptManagementSkeleton />;

  return (
    <div className="p-fluid-page flex flex-col gap-6">
      <div>
        <BackLink href={ROUTES.SETTINGS} label={t("backToSettings")} className="mb-3" />
        <h1 className="text-fluid-title font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>

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
