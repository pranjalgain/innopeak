import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { CURRENT_OWNER } from "@/app/_libs/constants/current-owner";
import { PromptService } from "@/app/_libs/services/prompt.service";
import type { AiPrompt, PromptTone } from "@/types/domain";

interface UsePromptsResult {
  prompts: AiPrompt[];
  isLoading: boolean;
  isSaving: boolean;
  saveNewVersion: (id: string, template: string) => Promise<void>;
  updateTone: (id: string, tone: PromptTone) => Promise<void>;
}

/** Load failures, save outcomes, and tone changes all surface via toast. */
export function usePrompts(): UsePromptsResult {
  const t = useTranslations("promptManagement.toasts");
  const [prompts, setPrompts] = React.useState<AiPrompt[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    PromptService.getPrompts()
      .then((result) => {
        if (!cancelled) setPrompts(result);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  const saveNewVersion = React.useCallback(
    async (id: string, template: string) => {
      const prompt = prompts.find((p) => p.id === id);
      if (!prompt) return;

      setIsSaving(true);
      try {
        const updated = await PromptService.createVersion(prompt, template, CURRENT_OWNER.name);
        setPrompts((prev) => prev.map((p) => (p.id === id ? updated : p)));
        toast.success(t("versionSaved", { version: updated.versions.length }));
      } catch {
        toast.error(t("saveFailed"));
      } finally {
        setIsSaving(false);
      }
    },
    [prompts, t],
  );

  const updateTone = React.useCallback(
    async (id: string, tone: PromptTone) => {
      const prompt = prompts.find((p) => p.id === id);
      if (!prompt) return;

      const updated = await PromptService.updateTone(prompt, tone);
      setPrompts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      toast.success(t("toneUpdated"));
    },
    [prompts, t],
  );

  return { prompts, isLoading, isSaving, saveNewVersion, updateTone };
}
