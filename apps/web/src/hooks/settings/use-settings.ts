
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { ConnectionService } from "@/app/_libs/services/connection.service";
import { SettingsApiError, SettingsService } from "@/app/_libs/services/settings.service";
import { connectionLocationsQueryKey } from "@/hooks/connections/use-business-switcher";
import { useConnection } from "@/hooks/connections/use-connection";
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
 * Loads Settings once, then owns interactive state through react-query's cache. Blocklist
 * add/remove wait on the settings API and only update chips after success. Notification
 * recipients apply optimistically instead (see `updateRecipientChannel`/`toggleRecipientActive`
 * below) — a channel toggle or active switch is a fast, low-stakes, instantly-reversible edit,
 * unlike adding/removing a blocklist term.
 *
 * `saveGeneral` is the one path that writes `PUT /v1/settings` — the General tab stages edits
 * locally (its own Save/Cancel) and calls it once on an explicit Save click; the AI tab's reply-
 * count select calls it immediately on change instead, since it has no staged-draft UI of its own.
 *
 * `enabled` (default `true`) gates the underlying query — `GET /v1/settings` is
 * `@Roles(UserRole.OWNER)` on the backend, so `SettingsView` passes `false` for a `member`
 * caller. Without it, every tenant member hit this 403 on every Settings visit and saw a
 * "Couldn't load settings" toast for a page they were never going to be allowed to load.
 */
export function useSettings(enabled = true): UseSettingsResult {
  const t = useTranslations("settings.toasts");
  const queryClient = useQueryClient();
  const { refresh: refreshConnection } = useConnection();

  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => SettingsService.getSettings(),
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

  /** Writes one recipient back into the cached list, leaving every other row untouched — the
   *  granularity both the success reconcile and the failure rollback need. */
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

  // Optimistic-local + fire-and-forget persist: the UI applies the change and reports success
  // immediately, independent of whether this background `PATCH` has actually confirmed yet. A
  // failed write rolls the optimistic edit back rather than leaving it silently wrong in the
  // cache. Callbacks live on the mutation itself, not on the individual `mutate()` call — per-call
  // callbacks are dropped whenever a second `mutate()` supersedes the first on the same observer,
  // so toggling two recipients in quick succession would silently lose the first one's toast *and*
  // its rollback. `onMutate`'s returned context is what carries each call's own snapshot back to
  // its own `onError`.
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
      // Only this recipient's prior state, not a snapshot of the whole settings object. Restoring
      // the whole thing on failure would revert rows that succeeded in the meantime: toggle A
      // (slow, then fails) and B (fast, succeeds), and A's rollback would put B's switch back too.
      return { restore };
    },
    // The server's own row replaces the optimistic guess, so what's rendered is what was actually
    // stored rather than what the client asked for. Without this the cache held the guess for the
    // full `staleTime`, and a value the backend normalized or clamped only surfaced on a reload.
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
        // The locations list is a separate cache entry, and `useBusinessSwitcher` only *disables*
        // its query once there's no connection — a disabled query keeps whatever it already
        // fetched, so the header's switcher would go on offering the locations this disconnect
        // just deactivated. Removed rather than invalidated: there is nothing to refetch while
        // disconnected, and the query is disabled anyway.
        queryClient.removeQueries({ queryKey: connectionLocationsQueryKey });
      },
      onError: () => toast.error(t("disconnectFailed")),
    });
  }, [settings, setSettings, t, refreshConnection, disconnectMutation, queryClient]);

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
