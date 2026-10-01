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
 * Same shape as the tenant dashboard's `NAV_ITEMS` (`app/(dashboard)/_components/nav-items.ts`)
 * — `AppShell`/`MobileBottomNav` are generic over this shape, `labelKey` resolves against
 * `adminNav.*` instead of `nav.*`. Statistics is deliberately not its own nav item — it's a tab
 * on Overview (`AdminDashboardView`), not a separate resource screen; see that component's own
 * doc comment for why. Activity, by contrast, gets its own item: platform activity and webhook
 * activity are both log-style views (filterable/paginated) an admin comes back to on their own,
 * not a glance-once summary figure.
 */
export const ADMIN_NAV_ITEMS = [
  { labelKey: "overview", href: ROUTES.ADMIN, icon: LuLayoutDashboard },
  { labelKey: "businesses", href: ROUTES.ADMIN_BUSINESSES, icon: LuBuilding2 },
  { labelKey: "users", href: ROUTES.ADMIN_USERS, icon: LuUsers },
  { labelKey: "billing", href: ROUTES.ADMIN_BILLING, icon: LuCreditCard },
  { labelKey: "activity", href: ROUTES.ADMIN_ACTIVITY, icon: LuActivity },
  { labelKey: "settings", href: ROUTES.ADMIN_SETTINGS, icon: LuSettings },
] as const;
