
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { ConnectionService } from "@/app/_libs/services/connection.service";
import { SettingsApiError, SettingsService } from "@/app/_libs/services/settings.service";
import { useConnection } from "@/hooks/connections/use-connection";
import type { GeneralSettings, NotificationChannel, SettingsData } from "@/types/domain";

export const settingsQueryKey = ["settings"] as const;

interface UseSettingsResult {
  settings: SettingsData | null;
  isLoading: boolean;
  saveGeneral: (patch: Partial<GeneralSettings>) => Promise<boolean>;
  addBlocklistTerm: (term: string) => Promise<boolean>;
  removeBlocklistTerm: (id: string) => Promise<void>;
  updateRecipientChannel: (id: string, channel: NotificationChannel) => void;
  toggleRecipientActive: (id: string) => void;
  disconnect: () => void;
}

/**
 * Loads Settings once, then owns interactive state through react-query's cache. Blocklist
 * add/remove wait on the settings API and only update chips after success. Other tabs still
 * persist through the mock `updateSettings` PUT.
 *
 * `saveGeneral` is the one path that writes `PUT /v1/settings` — the General tab stages edits
 * locally (its own Save/Cancel) and calls it once on an explicit Save click; the AI tab's reply-
 * count select calls it immediately on change instead, since it has no staged-draft UI of its own.
 */
export function useSettings(): UseSettingsResult {
  const t = useTranslations("settings.toasts");
  const queryClient = useQueryClient();
  const { refresh: refreshConnection } = useConnection();

  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => SettingsService.getSettings(),
  });

  useEffect(() => {
    if (settingsQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQuery.isError]);

  const settings = settingsQuery.data ?? null;

  const setSettings = useCallback(
    (next: SettingsData) => queryClient.setQueryData(settingsQueryKey, next),
    [queryClient],
  );

  // Optimistic-local + fire-and-forget persist, same as before: the UI applies the change and
  // reports success immediately, independent of whether this background PUT actually succeeds.
  // But unlike the old plain `useState`, a failed write here now sits in react-query's shared
  // cache for the rest of its 5-minute staleTime, visible to any other reader of `["settings"]` —
  // so a failure rolls the optimistic write back instead of leaving it there unnoticed.
  const backgroundPersistMutation = useMutation({
    mutationFn: (next: SettingsData) => SettingsService.updateSettings(next),
  });

  const persist = useCallback(
    (next: SettingsData) => {
      const previous = queryClient.getQueryData<SettingsData>(settingsQueryKey);
      setSettings(next);
      backgroundPersistMutation.mutate(next, {
        onError: () => {
          if (previous) setSettings(previous);
          toast.error(t("updateFailed"));
        },
      });
    },
    [queryClient, setSettings, backgroundPersistMutation, t],
  );

  const saveGeneralMutation = useMutation({
    mutationFn: (nextGeneral: GeneralSettings) =>
      SettingsService.updateGeneralSettings({
        escalationRatingThreshold: nextGeneral.escalationRatingThreshold,
        autoPostEnabled: nextGeneral.autoPostApprovedReplies,
        reviewDataRetentionMonths: nextGeneral.reviewDataRetentionMonths,
        aiReplyCount: nextGeneral.aiReplyCount,
      }),
  });

  const saveGeneral = useCallback(
    async (patch: Partial<GeneralSettings>): Promise<boolean> => {
      if (!settings) return false;
      const nextGeneral = { ...settings.general, ...patch };
      try {
        await saveGeneralMutation.mutateAsync(nextGeneral);
        setSettings({ ...settings, general: nextGeneral });
        return true;
      } catch (error) {
        toast.error(error instanceof SettingsApiError ? error.message : t("generalSaveFailed"));
        return false;
      }
    },
    [settings, t, saveGeneralMutation, setSettings],
  );

  const addBlocklistTermMutation = useMutation({
    mutationFn: (term: string) => SettingsService.addBlocklistTerm(term),
  });

  const addBlocklistTerm = useCallback(
    async (term: string): Promise<boolean> => {
      if (!settings) return false;
      const trimmed = term.trim();
      if (!trimmed) return false;

      try {
        const created = await addBlocklistTermMutation.mutateAsync(trimmed);
        setSettings({ ...settings, blocklistTerms: [...settings.blocklistTerms, created] });
        toast.success(t("blocklistTermAdded"));
        return true;
      } catch (error) {
        toast.error(error instanceof SettingsApiError ? error.message : t("saveFailed"));
        return false;
      }
    },
    [settings, t, addBlocklistTermMutation, setSettings],
  );

  const removeBlocklistTermMutation = useMutation({
    mutationFn: (id: string) => SettingsService.removeBlocklistTerm(id),
  });

  const removeBlocklistTerm = useCallback(
    async (id: string): Promise<void> => {
      if (!settings) return;

      try {
        await removeBlocklistTermMutation.mutateAsync(id);
        setSettings({
          ...settings,
          blocklistTerms: settings.blocklistTerms.filter((item) => item.id !== id),
        });
        toast.success(t("blocklistTermRemoved"));
      } catch (error) {
        toast.error(error instanceof SettingsApiError ? error.message : t("saveFailed"));
      }
    },
    [settings, t, removeBlocklistTermMutation, setSettings],
  );

  const updateRecipientChannel = useCallback(
    (id: string, channel: NotificationChannel) => {
      if (!settings) return;
      persist({
        ...settings,
        notificationRecipients: settings.notificationRecipients.map((recipient) =>
          recipient.id === id ? { ...recipient, channel } : recipient,
        ),
      });
      toast.success(t("notificationChannelUpdated"));
    },
    [settings, persist, t],
  );

  const toggleRecipientActive = useCallback(
    (id: string) => {
      if (!settings) return;
      persist({
        ...settings,
        notificationRecipients: settings.notificationRecipients.map((recipient) =>
          recipient.id === id ? { ...recipient, isActive: !recipient.isActive } : recipient,
        ),
      });
      toast.success(t("notificationToggled"));
    },
    [settings, persist, t],
  );

  const disconnectMutation = useMutation({
    mutationFn: () => ConnectionService.disconnect(),
  });

  const disconnect = useCallback(() => {
    if (!settings) return;

    // A real DELETE now, not a localStorage flag: the backend deactivates the tenant's locations
    // and revokes the stored Google credential. The optimistic local update stays so the tab
    // reflects the change immediately, but the authoritative state is the API's.
    disconnectMutation.mutate(undefined, {
      onSuccess: async () => {
        setSettings({ ...settings, connection: { ...settings.connection, status: "disconnected" } });
        toast.success(t("disconnected"));
        // `useConnection`'s cached `["connection"]` data would otherwise keep reporting
        // "connected" until it next refetches on its own — the guard, the reconnect banner and
        // any other reader of that cache entry would all lag the change this tab just made.
        await refreshConnection();
      },
      onError: () => toast.error(t("disconnectFailed")),
    });
  }, [settings, setSettings, t, refreshConnection, disconnectMutation]);

  return {
    settings,
    isLoading: settingsQuery.isLoading,
    saveGeneral,
    addBlocklistTerm,
    removeBlocklistTerm,
    updateRecipientChannel,
    toggleRecipientActive,
    disconnect,
  };
}
