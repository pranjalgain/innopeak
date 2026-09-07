"use client";

import { useTranslations } from "next-intl";

import { AppShell } from "@/app/(dashboard)/_components/app-shell";
import { ConnectionGuard } from "@/app/(dashboard)/_components/connection-guard";
import { NAV_ITEMS } from "@/app/(dashboard)/_components/nav-items";
import { RequireAuth } from "@/app/_components/require-auth";
import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { CURRENT_OWNER } from "@/app/_libs/constants/current-owner";
import { ROUTES } from "@/app/_libs/constants/routes";
import { ConnectionProvider } from "@/app/_libs/providers/connection-provider";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Shell for every screen behind login (Dashboard, Review Queue, Settings,
 * Review Detail) — sidebar/header/mobile-nav chrome lives in `AppShell`.
 * `RequireAuth` gates all of it behind a real session (redirecting to
 * `/login` otherwise); `ConnectionGuard` then further gates it behind a
 * connected Google Business Profile, redirecting to onboarding otherwise.
 *
 * `ConnectionProvider` sits above the guard so `GET /v1/connections` is
 * fetched once for the whole dashboard rather than on every navigation —
 * and so any screen inside it (Settings' Connection tab, the reconnect
 * banner) reads the same answer the guard acted on.
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const t = useTranslations("appShell");

  return (
    <RequireAuth loadingFallback={<ShellSkeleton />}>
      <ConnectionProvider>
        <ConnectionGuard>
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
        </ConnectionGuard>
      </ConnectionProvider>
    </RequireAuth>
  );
}
