
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { PromptApiError, PromptService } from "@/app/_libs/services/prompt.service";
import type { AiPrompt, PromptTone } from "@/types/domain";

/** Mirrors backend's PROMPT_ERROR_CODES (apps/backend/src/api/prompts/constants/prompts.constants.ts). */
const TEMPLATE_VALIDATION_ERROR_CODES = new Set(["UNKNOWN_PLACEHOLDER", "MISSING_PLACEHOLDER"]);

/** For these codes the backend's own message already names the offending placeholder(s) and is
 *  more useful than the generic toast. */
function templateValidationMessage(error: unknown): string | undefined {
  if (error instanceof PromptApiError && TEMPLATE_VALIDATION_ERROR_CODES.has(error.errorCode ?? "")) {
    return error.message;
  }
  return undefined;
}

export const promptsQueryKey = ["prompts"] as const;

interface UsePromptsResult {
  prompts: AiPrompt[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  isSaving: boolean;
  /** Whether the version was saved: the editor stays open (keeping the edited text) when it was not. */
  saveNewVersion: (id: string, template: string) => Promise<boolean>;
  updateTone: (id: string, tone: PromptTone) => Promise<void>;
}

export function usePrompts(): UsePromptsResult {
  const t = useTranslations("promptManagement.toasts");
  const queryClient = useQueryClient();

  const promptsQuery = useQuery({
    queryKey: promptsQueryKey,
    queryFn: () => PromptService.getPrompts(),
  });

  useEffect(() => {
    if (!promptsQuery.isError) return;
    // A Member can reach this page but the list endpoint is owner-only, so a 403 isn't transient and "try again" would mislead.
    const isForbidden = promptsQuery.error instanceof PromptApiError && promptsQuery.error.statusCode === 403;
    toast.error(isForbidden ? t("accessDenied") : t("loadFailed"));
    // react-query v5 dropped `useQuery`'s onError; this fires once per isError transition.
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
    onError: (error) => toast.error(templateValidationMessage(error) ?? t("saveFailed")),
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
      if (!prompt) return false;
      // The rejection is turned into `false` after the onError toast, so the editor can keep the edited template open instead of closing on it.
      try {
        await saveVersionMutation.mutateAsync({ prompt, template });
        return true;
      } catch {
        // Already reported via the mutation's onError toast.
        return false;
      }
    },
    [promptsQuery.data, saveVersionMutation],
  );

  const updateTone = useCallback(
    async (id: string, tone: PromptTone) => {
      const prompt = promptsQuery.data?.find((p) => p.id === id);
      if (!prompt) return;
      // Fired without await from `prompt-tone-select`'s `onValueChange`, so a rejection would otherwise be unhandled.
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
    // A failed *refresh* keeps the data already on screen (and the editor open over it); only a load that left nothing is an error screen.
    isError: promptsQuery.isError && promptsQuery.data === undefined,
    refetch: () => void promptsQuery.refetch(),
    isSaving: saveVersionMutation.isPending,
    saveNewVersion,
    updateTone,
  };
}
