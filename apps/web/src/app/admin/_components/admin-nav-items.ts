import { LuBuilding2, LuLayoutDashboard, LuSettings, LuUsers } from "react-icons/lu";

import { ROUTES } from "@/app/_libs/constants/routes";

/**
 * Same shape as the tenant dashboard's `NAV_ITEMS` (`app/(dashboard)/_components/nav-items.ts`)
 * — `AppShell`/`MobileBottomNav` are generic over this shape, `labelKey` resolves against
 * `adminNav.*` instead of `nav.*`.
 */
export const ADMIN_NAV_ITEMS = [
  { labelKey: "overview", href: ROUTES.ADMIN, icon: LuLayoutDashboard },
  { labelKey: "businesses", href: ROUTES.ADMIN_BUSINESSES, icon: LuBuilding2 },
  { labelKey: "users", href: ROUTES.ADMIN_USERS, icon: LuUsers },
  { labelKey: "settings", href: ROUTES.ADMIN_SETTINGS, icon: LuSettings },
] as const;
