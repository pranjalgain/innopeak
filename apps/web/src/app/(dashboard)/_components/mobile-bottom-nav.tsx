"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { isNavItemActive, type ShellNavItem } from "@/app/(dashboard)/_components/shell-nav";
import { cn } from "@/app/_libs/utils/cn";

interface MobileBottomNavProps {
  navItems: readonly ShellNavItem[];
  navNamespace: string;
  homeHref: string;
}

/**
 * Replaces the sidebar entirely on mobile — the design uses a persistent
 * bottom tab bar there rather than a hamburger/drawer. Takes the same
 * `navItems`/`navNamespace`/`homeHref` as `AppShell` so the two can never
 * drift.
 */
export function MobileBottomNav({ navItems, navNamespace, homeHref }: MobileBottomNavProps) {
  const t = useTranslations(navNamespace);
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex h-16 items-stretch border-t border-border bg-card">
      {navItems.map((item) => {
        const isActive = isNavItemActive(pathname, item.href, homeHref);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-150 ease-fluid",
              isActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex items-center justify-center rounded-full px-3 py-0.5 transition-colors duration-150 ease-fluid",
                isActive && "bg-accent",
              )}
            >
              <Icon size={20} />
            </span>
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
