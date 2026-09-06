"use client";

import { useTranslations } from "next-intl";

import { AppShell } from "@/app/(dashboard)/_components/app-shell";
import { GoogleConnectionGuard } from "@/app/(dashboard)/_components/google-connection-guard";
import { NAV_ITEMS } from "@/app/(dashboard)/_components/nav-items";
import { RequireAuth } from "@/app/_components/require-auth";
import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { CURRENT_OWNER } from "@/app/_libs/constants/current-owner";
import { ROUTES } from "@/app/_libs/constants/routes";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Shell for every screen behind login (Dashboard, Review Queue, Settings,
 * Review Detail) — sidebar/header/mobile-nav chrome lives in `AppShell`.
 * `RequireAuth` gates all of it behind a real session (redirecting to
 * `/login` otherwise); `GoogleConnectionGuard` then further gates it behind
 * a connected Google Business Profile, redirecting to onboarding otherwise.
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const t = useTranslations("appShell");

  return (
    <RequireAuth loadingFallback={<ShellSkeleton />}>
      <GoogleConnectionGuard>
        <AppShell
          navItems={NAV_ITEMS}
          navNamespace="nav"
          homeHref={ROUTES.DASHBOARD}
          identity={{
            name: CURRENT_OWNER.name,
            initials: CURRENT_OWNER.initials,
            roleLabel: t("accountOwnerRole"),
          }}
        >
          {children}
        </AppShell>
      </GoogleConnectionGuard>
    </RequireAuth>
  );
}
