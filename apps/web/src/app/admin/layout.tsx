"use client";

import { useTranslations } from "next-intl";

import { AppShell } from "@/app/(dashboard)/_components/app-shell";
import { CURRENT_SUPER_ADMIN } from "@/app/_libs/constants/current-owner";
import { ROUTES } from "@/app/_libs/constants/routes";
import { AdminGuard } from "@/app/admin/_components/admin-guard";
import { ADMIN_NAV_ITEMS } from "@/app/admin/_components/admin-nav-items";

interface AdminLayoutProps {
  children: React.ReactNode;
}

/**
 * Shell for every screen under `/admin` — a separate identity from the
 * tenant dashboard (see `AdminGuard`), sharing the same `AppShell` chrome
 * with its own nav items and no review notifications.
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  const t = useTranslations("appShell");

  return (
    <AdminGuard>
      <AppShell
        navItems={ADMIN_NAV_ITEMS}
        navNamespace="adminNav"
        homeHref={ROUTES.ADMIN}
        profileHref={ROUTES.ADMIN_SETTINGS}
        showNotifications={false}
        identity={{
          name: CURRENT_SUPER_ADMIN.name,
          initials: CURRENT_SUPER_ADMIN.initials,
          roleLabel: t("superAdminRole"),
        }}
      >
        {children}
      </AppShell>
    </AdminGuard>
  );
}
