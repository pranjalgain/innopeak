import { LuLayoutDashboard, LuList, LuSettings } from "react-icons/lu";

import { ROUTES } from "@/app/_libs/constants/routes";

export const NAV_ITEMS = [
  { labelKey: "dashboard", href: ROUTES.DASHBOARD, icon: LuLayoutDashboard },
  { labelKey: "reviewQueue", href: ROUTES.REVIEW_QUEUE, icon: LuList },
  { labelKey: "settings", href: ROUTES.SETTINGS, icon: LuSettings },
] as const;
