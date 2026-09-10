import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

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
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
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

  const saveNewVersion = useCallback(
    async (id: string, template: string) => {
      const prompt = prompts.find((p) => p.id === id);
      if (!prompt) return;

      setIsSaving(true);
      try {
        const updated = await PromptService.createVersion(prompt, template);
        setPrompts((prev) => prev.map((p) => (p.id === id ? updated : p)));
        // The number the API assigned, not the array length: versions are `max(version) + 1`
        // server-side, so a gap would make the count disagree with what the history shows.
        const saved = updated.versions[updated.versions.length - 1];
        toast.success(t("versionSaved", { version: saved?.version ?? updated.versions.length }));
      } catch {
        toast.error(t("saveFailed"));
      } finally {
        setIsSaving(false);
      }
    },
    [prompts, t],
  );

  const updateTone = useCallback(
    async (id: string, tone: PromptTone) => {
      const prompt = prompts.find((p) => p.id === id);
      if (!prompt) return;

      try {
        const updated = await PromptService.updateTone(prompt, tone);
        setPrompts((prev) => prev.map((p) => (p.id === id ? updated : p)));
        toast.success(t("toneUpdated"));
      } catch {
        toast.error(t("saveFailed"));
      }
    },
    [prompts, t],
  );

  return { prompts, isLoading, isSaving, saveNewVersion, updateTone };
}
