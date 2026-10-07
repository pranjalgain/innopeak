import {
  LuActivity,
  LuBuilding2,
  LuCreditCard,
  LuLayoutDashboard,
  LuSettings,
  LuUsers,
} from "react-icons/lu";

import { ROUTES } from "@/app/_libs/constants/routes";

/**
 * Same shape as the tenant `NAV_ITEMS`, but `labelKey` resolves against `adminNav.*`. Statistics
 * is deliberately a tab on Overview, not an item; Activity gets its own since log-style views are
 * revisited on their own.
 */
export const ADMIN_NAV_ITEMS = [
  { labelKey: "overview", href: ROUTES.ADMIN, icon: LuLayoutDashboard },
  { labelKey: "businesses", href: ROUTES.ADMIN_BUSINESSES, icon: LuBuilding2 },
  { labelKey: "users", href: ROUTES.ADMIN_USERS, icon: LuUsers },
  { labelKey: "billing", href: ROUTES.ADMIN_BILLING, icon: LuCreditCard },
  { labelKey: "activity", href: ROUTES.ADMIN_ACTIVITY, icon: LuActivity },
  { labelKey: "settings", href: ROUTES.ADMIN_SETTINGS, icon: LuSettings },
] as const;
