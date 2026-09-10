import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useConnection } from "@/app/_libs/providers/connection-provider";
import { ConnectionService } from "@/app/_libs/services/connection.service";
import { SettingsApiError, SettingsService } from "@/app/_libs/services/settings.service";
import type { GeneralSettings, NotificationChannel, SettingsData } from "@/types/domain";

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
 * Loads Settings once, then owns interactive state locally. Blocklist add/remove wait on the
 * settings API and only update chips after success. Other tabs still persist through the mock
 * `updateSettings` PUT.
 *
 * `saveGeneral` is the one path that writes `PUT /v1/settings` — the General tab stages edits
 * locally (its own Save/Cancel) and calls it once on an explicit Save click; the AI tab's reply-
 * count select calls it immediately on change instead, since it has no staged-draft UI of its own.
 */
export function useSettings(): UseSettingsResult {
  const t = useTranslations("settings.toasts");
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    SettingsService.getSettings()
      .then((result) => {
        if (!cancelled) setSettings(result);
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

  const persist = useCallback((next: SettingsData) => {
    setSettings(next);
    void SettingsService.updateSettings(next);
  }, []);

  const saveGeneral = useCallback(
    async (patch: Partial<GeneralSettings>): Promise<boolean> => {
      if (!settings) return false;
      const nextGeneral = { ...settings.general, ...patch };
      try {
        await SettingsService.updateGeneralSettings({
          escalationRatingThreshold: nextGeneral.escalationRatingThreshold,
          autoPostEnabled: nextGeneral.autoPostApprovedReplies,
          reviewDataRetentionMonths: nextGeneral.reviewDataRetentionMonths,
          aiReplyCount: nextGeneral.aiReplyCount,
        });
        setSettings({ ...settings, general: nextGeneral });
        return true;
      } catch (error) {
        toast.error(error instanceof SettingsApiError ? error.message : t("generalSaveFailed"));
        return false;
      }
    },
    [settings, t],
  );

  const addBlocklistTerm = useCallback(
    async (term: string): Promise<boolean> => {
      if (!settings) return false;
      const trimmed = term.trim();
      if (!trimmed) return false;

      try {
        const created = await SettingsService.addBlocklistTerm(trimmed);
        setSettings({
          ...settings,
          blocklistTerms: [...settings.blocklistTerms, created],
        });
        toast.success(t("blocklistTermAdded"));
        return true;
      } catch (error) {
        toast.error(error instanceof SettingsApiError ? error.message : t("saveFailed"));
        return false;
      }
    },
    [settings, t],
  );

  const removeBlocklistTerm = useCallback(
    async (id: string): Promise<void> => {
      if (!settings) return;

      try {
        await SettingsService.removeBlocklistTerm(id);
        setSettings({
          ...settings,
          blocklistTerms: settings.blocklistTerms.filter((item) => item.id !== id),
        });
        toast.success(t("blocklistTermRemoved"));
      } catch (error) {
        toast.error(error instanceof SettingsApiError ? error.message : t("saveFailed"));
      }
    },
    [settings, t],
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

  const { refresh: refreshConnection } = useConnection();

  const disconnect = useCallback(() => {
    if (!settings) return;

    // A real DELETE now, not a localStorage flag: the backend deactivates the tenant's locations
    // and revokes the stored Google credential. The optimistic local update stays so the tab
    // reflects the change immediately, but the authoritative state is the API's.
    void ConnectionService.disconnect()
      .then(async () => {
        persist({ ...settings, connection: { ...settings.connection, status: "disconnected" } });
        toast.success(t("disconnected"));
        // The dashboard layout's ConnectionProvider fetched once on mount and would otherwise keep
        // reporting "connected" until a full reload — the guard, the reconnect banner and any other
        // reader of that context would all lag the change this tab just made.
        await refreshConnection();
      })
      .catch(() => {
        toast.error(t("disconnectFailed"));
      });
  }, [settings, persist, t, refreshConnection]);

  return {
    settings,
    isLoading,
    saveGeneral,
    addBlocklistTerm,
    removeBlocklistTerm,
    updateRecipientChannel,
    toggleRecipientActive,
    disconnect,
  };
}
