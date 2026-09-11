
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { PromptService } from "@/app/_libs/services/prompt.service";
import type { AiPrompt, PromptTone } from "@/types/domain";

export const promptsQueryKey = ["prompts"] as const;

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
  const queryClient = useQueryClient();

  const promptsQuery = useQuery({
    queryKey: promptsQueryKey,
    queryFn: () => PromptService.getPrompts(),
  });

  useEffect(() => {
    if (promptsQuery.isError) toast.error(t("loadFailed"));
    // react-query v5 dropped useQuery's onError — this is its recommended replacement, firing
    // once per isError transition rather than on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptsQuery.isError]);

  const applyUpdate = useCallback(
    (updated: AiPrompt) => {
      queryClient.setQueryData<AiPrompt[]>(promptsQueryKey, (prev) =>
        prev?.map((p) => (p.id === updated.id ? updated : p)),
      );
    },
    [queryClient],
  );

  const saveVersionMutation = useMutation({
    mutationFn: ({ prompt, template }: { prompt: AiPrompt; template: string }) =>
      PromptService.createVersion(prompt, template),
    onSuccess: (updated) => {
      applyUpdate(updated);
      // The number the API assigned, not the array length: versions are `max(version) + 1`
      // server-side, so a gap would make the count disagree with what the history shows.
      const saved = updated.versions[updated.versions.length - 1];
      toast.success(t("versionSaved", { version: saved?.version ?? updated.versions.length }));
    },
    onError: () => toast.error(t("saveFailed")),
  });

  const updateToneMutation = useMutation({
    mutationFn: ({ prompt, tone }: { prompt: AiPrompt; tone: PromptTone }) =>
      PromptService.updateTone(prompt, tone),
    onSuccess: (updated) => {
      applyUpdate(updated);
      toast.success(t("toneUpdated"));
    },
    onError: () => toast.error(t("saveFailed")),
  });

  const saveNewVersion = useCallback(
    async (id: string, template: string) => {
      const prompt = promptsQuery.data?.find((p) => p.id === id);
      if (!prompt) return;
      // `mutateAsync` rejects even after its own `onError` toast fires — caught and swallowed
      // here so a failed save surfaces only as that toast, not as a rejection the caller must
      // also handle. `prompt-editor-dialog.tsx` relies on this: it awaits this call and then
      // closes the dialog, and an uncaught rejection would skip that close on every failure.
      try {
        await saveVersionMutation.mutateAsync({ prompt, template });
      } catch {
        // Already reported via the mutation's onError toast.
      }
    },
    [promptsQuery.data, saveVersionMutation],
  );

  const updateTone = useCallback(
    async (id: string, tone: PromptTone) => {
      const prompt = promptsQuery.data?.find((p) => p.id === id);
      if (!prompt) return;
      // See `saveNewVersion` above — `prompt-tone-select.tsx` fires this from `onValueChange`
      // without awaiting it at all, so an uncaught rejection here would be unhandled outright.
      try {
        await updateToneMutation.mutateAsync({ prompt, tone });
      } catch {
        // Already reported via the mutation's onError toast.
      }
    },
    [promptsQuery.data, updateToneMutation],
  );

  return {
    prompts: promptsQuery.data ?? [],
    isLoading: promptsQuery.isLoading,
    isSaving: saveVersionMutation.isPending,
    saveNewVersion,
    updateTone,
  };
}
