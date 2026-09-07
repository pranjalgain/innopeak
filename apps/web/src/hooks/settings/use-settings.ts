import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { useConnection } from "@/app/_libs/providers/connection-provider";
import { ConnectionService } from "@/app/_libs/services/connection.service";
import { SettingsApiError, SettingsService } from "@/app/_libs/services/settings.service";
import type { GeneralSettings, NotificationChannel, SettingsData } from "@/types/domain";

interface UseSettingsResult {
  settings: SettingsData | null;
  isLoading: boolean;
  updateGeneral: (patch: Partial<GeneralSettings>) => void;
  addBlocklistTerm: (term: string) => Promise<boolean>;
  removeBlocklistTerm: (id: string) => Promise<void>;
  updateRecipientChannel: (id: string, channel: NotificationChannel) => void;
  toggleRecipientActive: (id: string) => void;
  disconnect: () => void;
}

const GENERAL_SAVE_DEBOUNCE_MS = 400;

function isAiReplyCountOnly(patch: Partial<GeneralSettings>): boolean {
  return patch.aiReplyCount !== undefined && Object.keys(patch).length === 1;
}

/**
 * Loads Settings once, then owns interactive state locally. Blocklist add/remove wait on the
 * settings API and only update chips after success. General tab writes `PUT /v1/settings` (debounced
 * for the slider/retention input; immediate for auto-post). `aiReplyCount` stays local. Other tabs
 * still persist through the mock `updateSettings` PUT. `updateGeneral` stays toast-free because it
 * also backs the continuous escalation-threshold slider.
 */
export function useSettings(): UseSettingsResult {
  const t = useTranslations("settings.toasts");
  const [settings, setSettings] = React.useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const generalSaveTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => {
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
      if (generalSaveTimer.current !== undefined) {
        clearTimeout(generalSaveTimer.current);
      }
    };
  }, [t]);

  const persist = React.useCallback((next: SettingsData) => {
    setSettings(next);
    void SettingsService.updateSettings(next);
  }, []);

  const persistGeneral = React.useCallback(
    (general: GeneralSettings) => {
      void SettingsService.updateGeneralSettings({
        escalationRatingThreshold: general.escalationRatingThreshold,
        autoPostEnabled: general.autoPostApprovedReplies,
        reviewDataRetentionMonths: general.reviewDataRetentionMonths,
      }).catch((error: unknown) => {
        toast.error(error instanceof SettingsApiError ? error.message : t("generalSaveFailed"));
      });
    },
    [t],
  );

  const updateGeneral = React.useCallback(
    (patch: Partial<GeneralSettings>) => {
      if (!settings) return;
      const nextGeneral = { ...settings.general, ...patch };
      const next = { ...settings, general: nextGeneral };
      setSettings(next);

      if (isAiReplyCountOnly(patch)) {
        return;
      }

      if (patch.autoPostApprovedReplies !== undefined) {
        if (generalSaveTimer.current !== undefined) {
          clearTimeout(generalSaveTimer.current);
        }
        persistGeneral(nextGeneral);
        return;
      }

      if (generalSaveTimer.current !== undefined) {
        clearTimeout(generalSaveTimer.current);
      }
      generalSaveTimer.current = setTimeout(() => {
        persistGeneral(nextGeneral);
      }, GENERAL_SAVE_DEBOUNCE_MS);
    },
    [settings, persistGeneral],
  );

  const addBlocklistTerm = React.useCallback(
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

  const removeBlocklistTerm = React.useCallback(
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

  const updateRecipientChannel = React.useCallback(
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

  const toggleRecipientActive = React.useCallback(
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

  const disconnect = React.useCallback(() => {
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
    updateGeneral,
    addBlocklistTerm,
    removeBlocklistTerm,
    updateRecipientChannel,
    toggleRecipientActive,
    disconnect,
  };
}
