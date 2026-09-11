"use client";

import { useTranslations } from "next-intl";

import { AppShell } from "@/app/(dashboard)/_components/app-shell";
import { ConnectionGuard } from "@/app/(dashboard)/_components/connection-guard";
import { NAV_ITEMS } from "@/app/(dashboard)/_components/nav-items";
import { RequireAuth } from "@/app/_components/require-auth";
import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { AUTH_METHODS } from "@/app/_libs/constants/auth-methods";
import { ROUTES } from "@/app/_libs/constants/routes";
import { storedDisplayName } from "@/app/_libs/services/tenant-owner-profile.service";
import { getInitials } from "@/app/_libs/utils/initials";
import { useTenantOwnerProfile } from "@/hooks/settings/use-tenant-owner-profile";

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
 * `ConnectionGuard` reads `GET /v1/connections` through `useConnection()`, which is backed by
 * react-query's shared cache — Settings' Connection tab and the reconnect banner call the same
 * hook and read the same cached answer the guard acted on, with no provider needed to share it.
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const t = useTranslations("appShell");
  // Same profile Settings' own tab reads — one source for name/avatar/initials, so the sidebar and
  // Settings can never disagree about who's signed in.
  const { profile } = useTenantOwnerProfile();
  const displayName = profile?.name ?? storedDisplayName();

  return (
    <RequireAuth loadingFallback={<ShellSkeleton />}>
      <ConnectionGuard>
        <AppShell
          navItems={NAV_ITEMS}
          navNamespace="nav"
          homeHref={ROUTES.DASHBOARD}
          // Deep-links to the Profile tab only when it actually renders: `settings-view` gates
          // that tab on AUTH_METHODS.password, and `?tab=profile` with no matching trigger left
          // Radix with nothing selected — an empty Settings page.
          profileHref={
            AUTH_METHODS.password ? `${ROUTES.SETTINGS}?tab=profile` : ROUTES.SETTINGS
          }
          identity={{
            // Storage is the optimistic value only until `GET /v1/auth/me` answers: the shell
            // paints on first render and a blank name there is more jarring than a stale one.
            // Settings' Profile tab, where being wrong actually matters, waits for the server.
            name: displayName,
            initials: displayName === "" ? "" : getInitials(displayName),
            avatarUrl: profile?.avatarUrl ?? null,
            roleLabel: t("accountOwnerRole"),
          }}
        >
          {children}
        </AppShell>
      </ConnectionGuard>
    </RequireAuth>
  );
}
