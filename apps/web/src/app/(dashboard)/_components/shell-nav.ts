import type { IconType } from "react-icons/lib";

/** Shared between the desktop/tablet sidebar and the mobile bottom nav, so the two can never drift. */
export interface ShellNavItem {
  labelKey: string;
  href: string;
  icon: IconType;
}

/** Whoever's signed in — a tenant owner or a super admin — shown in the sidebar footer/header account menu. */
export interface ShellIdentity {
  name: string;
  initials: string;
  roleLabel: string;
  /** Optional — the Super Admin shell has no profile picture concept and omits this entirely. */
  avatarUrl?: string | null;
}

/**
 * Prefix matching breaks when one nav item's href is itself a path segment
 * of another (e.g. `/admin` vs. `/admin/tenants`) — the item whose href
 * equals the shell's home link only matches exactly, everything else still
 * matches by prefix (so a detail route like `/admin/tenants/123` still
 * highlights "Tenants"). Lives in its own module (not `app-shell.tsx`) so
 * `AppShell` and `MobileBottomNav` can both import it without an
 * import cycle between the two.
 */
export function isNavItemActive(pathname: string, href: string, homeHref: string): boolean {
  return href === homeHref ? pathname === href : pathname.startsWith(href);
}
