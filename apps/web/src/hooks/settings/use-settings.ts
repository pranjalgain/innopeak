import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { GoogleConnectionService } from "@/app/_libs/services/google-connection.service";
import { SettingsService } from "@/app/_libs/services/settings.service";
import type { GeneralSettings, NotificationChannel, SettingsData } from "@/types/domain";

interface UseSettingsResult {
  settings: SettingsData | null;
  isLoading: boolean;
  updateGeneral: (patch: Partial<GeneralSettings>) => void;
  addBlocklistTerm: (term: string) => void;
  removeBlocklistTerm: (id: string) => void;
  updateRecipientChannel: (id: string, channel: NotificationChannel) => void;
  toggleRecipientActive: (id: string) => void;
  disconnect: () => void;
}

/**
 * Loads Settings once, then owns all interactive state locally — every
 * mutation updates state immediately and persists in the background via
 * `SettingsService.updateSettings` (a mock full-resource PUT for now). A
 * load failure and every discrete mutation (add/remove term, channel/active
 * toggle, disconnect) surface via toast. `updateGeneral` itself stays
 * toast-free since it also backs the continuous escalation-threshold
 * slider — toasting per-field is left to the two callers
 * (`GeneralSettingsSection`'s auto-post switch, `AiSettingsSection`'s reply
 * count select) that only ever call it for a discrete, one-shot change.
 */
export function useSettings(): UseSettingsResult {
  const t = useTranslations("settings.toasts");
  const [settings, setSettings] = React.useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

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
    };
  }, [t]);

  const persist = React.useCallback((next: SettingsData) => {
    setSettings(next);
    void SettingsService.updateSettings(next);
  }, []);

  const updateGeneral = React.useCallback(
    (patch: Partial<GeneralSettings>) => {
      if (!settings) return;
      persist({ ...settings, general: { ...settings.general, ...patch } });
    },
    [settings, persist],
  );

  const addBlocklistTerm = React.useCallback(
    (term: string) => {
      if (!settings) return;
      const trimmed = term.trim();
      if (!trimmed) return;
      persist({
        ...settings,
        blocklistTerms: [...settings.blocklistTerms, { id: `block_${Date.now()}`, term: trimmed }],
      });
      toast.success(t("blocklistTermAdded"));
    },
    [settings, persist, t],
  );

  const removeBlocklistTerm = React.useCallback(
    (id: string) => {
      if (!settings) return;
      persist({ ...settings, blocklistTerms: settings.blocklistTerms.filter((term) => term.id !== id) });
      toast.success(t("blocklistTermRemoved"));
    },
    [settings, persist, t],
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

  const disconnect = React.useCallback(() => {
    if (!settings) return;
    // Same flag the dashboard access guard reads — flip it here too so
    // disconnecting actually revokes dashboard access, not just this tab's view.
    void GoogleConnectionService.setStatus("disconnected");
    persist({ ...settings, connection: { ...settings.connection, status: "disconnected" } });
    toast.success(t("disconnected"));
  }, [settings, persist, t]);

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
