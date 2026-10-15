import { useTranslations } from "next-intl";

import type { PlatformActivityEntry } from "@/types/domain";

/**
 * One place that turns an activity entry into its sentence, shared by the Overview card and the Activity page. Most types are a
 * template filled with the business name or email; a platform settings change lists what moved ("Google sign-in: off"), using the
 * same labels as the platform settings screen, and notes when the admin confirmed a lockout.
 */
export function useActivityMessage(): (entry: PlatformActivityEntry) => string {
  const t = useTranslations("adminOverview.activityLog.messages");
  const tChanges = useTranslations("adminOverview.activityLog.settingChanges");

  return (entry) => {
    if (entry.type === "platform_settings_changed") {
      const changes = (entry.details?.changes ?? [])
        .map((change) => {
          const known = tChanges.has(`labels.${change.field}`);
          const label = known ? tChanges(`labels.${change.field}`) : change.field;
          return `${label}: ${change.to ? tChanges("on") : tChanges("off")}`;
        })
        .join("; ");
      return t("platform_settings_changed", {
        changes,
        lockout: entry.details?.lockoutConfirmed ? tChanges("lockoutConfirmed") : "",
      });
    }

    return t(entry.type, { businessName: entry.businessName ?? "", email: entry.email ?? "" });
  };
}
