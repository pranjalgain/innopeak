
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { ConnectionService } from "@/app/_libs/services/connection.service";
import { SettingsApiError, SettingsService } from "@/app/_libs/services/settings.service";
import { connectionLocationsQueryKey } from "@/hooks/connections/use-business-switcher";
import { connectionQueryKey, useConnection } from "@/hooks/connections/use-connection";
import type {
  GeneralSettings,
  NotificationChannel,
  NotificationRecipient,
  SettingsData,
} from "@/types/domain";

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
 * Blocklist add/remove wait on the API; notification recipients update optimistically (fast, low-
 * stakes, reversible). `saveGeneral` is the one `PUT /v1/settings` path: the General tab stages
 * edits and calls it on Save, the AI tab's reply-count select calls it on change. `enabled` gates
 * the query: `GET /v1/settings` is owner-only, so `SettingsView` passes `false` for members, who
 * would otherwise get a 403 toast on every visit.
 */
export function useSettings(enabled = true): UseSettingsResult {
  const t = useTranslations("settings.toasts");
  const queryClient = useQueryClient();
  const { refresh: refreshConnection } = useConnection();

  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    // The connection tile reads the app-wide connection cache rather than fetching `/v1/connections` a second time.
    queryFn: () =>
      SettingsService.getSettings(() =>
        queryClient.fetchQuery({
          queryKey: connectionQueryKey,
          queryFn: ({ signal }) => ConnectionService.getState(signal),
        }),
      ),
    enabled,
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

  /**
   * Writes one recipient back, leaving other rows untouched: the granularity both the success
   * reconcile and the failure rollback need.
   */
  const replaceRecipient = useCallback(
    (recipient: NotificationRecipient) => {
      queryClient.setQueryData<SettingsData>(settingsQueryKey, (current) =>
        current
          ? {
              ...current,
              notificationRecipients: current.notificationRecipients.map((existing) =>
                existing.id === recipient.id ? recipient : existing,
              ),
            }
          : current,
      );
    },
    [queryClient],
  );

  // Optimistic-local + fire-and-forget persist; a failed write rolls the edit back. Callbacks live
  // on the mutation, not `mutate()`: per-call callbacks are dropped when a second `mutate()`
  // supersedes the first on the same observer, losing the first toggle's toast and rollback.
  // `onMutate`'s context carries each call's own snapshot to its `onError`.
  const updateRecipientMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { channel?: NotificationChannel; isActive?: boolean };
      successMessage: string;
    }) => SettingsService.updateNotificationRecipient(id, patch),
    onMutate: ({ id, patch }) => {
      const previous = queryClient.getQueryData<SettingsData>(settingsQueryKey);
      const restore = previous?.notificationRecipients.find((recipient) => recipient.id === id);
      if (previous) {
        setSettings({
          ...previous,
          notificationRecipients: previous.notificationRecipients.map((recipient) =>
            recipient.id === id ? { ...recipient, ...patch } : recipient,
          ),
        });
      }
      // Roll back only this recipient, not the whole settings object: restoring everything would
      // revert rows that succeeded meanwhile (A slow-fails, B succeeds, A's rollback would undo B).
      return { restore };
    },
    // The server's row replaces the optimistic guess so a normalized or clamped value shows without
    // a reload (the cache would otherwise hold the guess for the full `staleTime`).
    onSuccess: (updated, { successMessage }) => {
      replaceRecipient(updated);
      toast.success(successMessage);
    },
    onError: (_error, _variables, context) => {
      if (context?.restore) replaceRecipient(context.restore);
      toast.error(t("updateFailed"));
    },
  });

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
        if (error instanceof SettingsApiError && error.statusCode === 403) {
          toast.error(t("forbidden"));
        } else {
          toast.error(error instanceof SettingsApiError ? error.message : t("generalSaveFailed"));
        }
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
        if (error instanceof SettingsApiError && error.statusCode === 403) {
          toast.error(t("forbidden"));
        } else {
          toast.error(error instanceof SettingsApiError ? error.message : t("saveFailed"));
        }
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
        if (error instanceof SettingsApiError && error.statusCode === 403) {
          toast.error(t("forbidden"));
        } else {
          toast.error(error instanceof SettingsApiError ? error.message : t("saveFailed"));
        }
      }
    },
    [settings, t, removeBlocklistTermMutation, setSettings],
  );

  const updateRecipientChannel = useCallback(
    (id: string, channel: NotificationChannel) => {
      if (!settings) return;
      updateRecipientMutation.mutate({
        id,
        patch: { channel },
        successMessage: t("notificationChannelUpdated"),
      });
    },
    [settings, updateRecipientMutation, t],
  );

  const toggleRecipientActive = useCallback(
    (id: string) => {
      if (!settings) return;
      const current = settings.notificationRecipients.find((recipient) => recipient.id === id);
      if (!current) return;
      updateRecipientMutation.mutate({
        id,
        patch: { isActive: !current.isActive },
        successMessage: t("notificationToggled"),
      });
    },
    [settings, updateRecipientMutation, t],
  );

  // Callbacks live on the mutation, not `mutate()`, as in `updateRecipientMutation`: a double-fired
  // click must not lose the first click's toast and cache cleanup.
  const disconnectMutation = useMutation({
    mutationFn: () => ConnectionService.disconnect(),
    onSuccess: async () => {
      if (!settings) return;
      setSettings({ ...settings, connection: { ...settings.connection, status: "disconnected" } });
      toast.success(t("disconnected"));
      // Otherwise `["connection"]` keeps reporting "connected" until its next refetch, so the guard
      // and reconnect banner would lag.
      await refreshConnection();
      // The locations list is a separate entry, and `useBusinessSwitcher` only disables its query
      // without a connection (which keeps stale data), so the switcher would keep offering
      // deactivated locations. Removed rather than invalidated: nothing to refetch while
      // disconnected.
      queryClient.removeQueries({ queryKey: connectionLocationsQueryKey });
    },
    onError: () => toast.error(t("disconnectFailed")),
  });

  const disconnect = useCallback(() => {
    if (!settings) return;
    // The backend deactivates the tenant's locations and revokes the stored Google credential. The
    // optimistic local update shows the change immediately, but the API's state is authoritative.
    disconnectMutation.mutate();
  }, [settings, disconnectMutation]);

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
