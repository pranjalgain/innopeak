import type { IconType } from "react-icons/lib";

export interface ShellNavItem {
  labelKey: string;
  href: string;
  icon: IconType;
}

export interface ShellIdentity {
  name: string;
  initials: string;
  roleLabel: string;
  avatarUrl?: string | null;
}

/**
 * The home item matches exactly, since prefix matching would also light up `/admin` for
 * `/admin/tenants`; others match by prefix. Own module to avoid an `AppShell`/`MobileBottomNav` import cycle.
 */
export function isNavItemActive(pathname: string, href: string, homeHref: string): boolean {
  return href === homeHref ? pathname === href : pathname.startsWith(href);
}
