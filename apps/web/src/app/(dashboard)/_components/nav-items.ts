import { LuLayoutDashboard, LuList, LuSettings } from "react-icons/lu";

import { ROUTES } from "@/app/_libs/constants/routes";

/**
 * Shared between the desktop/tablet sidebar and the mobile bottom nav, so
 * the two can never drift out of sync. `labelKey` resolves against the
 * `nav.*` messages via `useTranslations("nav")` in each consumer.
 */
export const NAV_ITEMS = [
  { labelKey: "dashboard", href: ROUTES.DASHBOARD, icon: LuLayoutDashboard },
  { labelKey: "reviewQueue", href: ROUTES.REVIEW_QUEUE, icon: LuList },
  { labelKey: "settings", href: ROUTES.SETTINGS, icon: LuSettings },
] as const;
