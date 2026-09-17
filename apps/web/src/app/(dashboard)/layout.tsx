"use client";

import { useTranslations } from "next-intl";

import { AppShell } from "@/app/(dashboard)/_components/app-shell";
import { ConnectionGuard } from "@/app/(dashboard)/_components/connection-guard";
import { NAV_ITEMS } from "@/app/(dashboard)/_components/nav-items";
import { RequireAuth } from "@/app/_components/require-auth";
import { ShellSkeleton } from "@/app/_components/shell-skeleton";
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
          // Always deep-links to `?tab=profile` — whether that tab actually renders depends on
          // `usePlatformSettings()`'s passwordLoginEnabled, which is async and would otherwise
          // make this href depend on a query that may not have resolved yet by the time someone
          // clicks it (a real race on a fresh tab, not just theoretical — it used to fall back to
          // plain ROUTES.SETTINGS while loading, silently landing on the wrong tab). `settings-view`
          // itself now falls back to "general" if `?tab=profile` arrives but the tab isn't
          // available, so there's no "empty Settings page" risk either way.
          profileHref={`${ROUTES.SETTINGS}?tab=profile`}
          identity={{
            // Storage is the optimistic value only until `GET /v1/auth/me` answers: the shell
            // paints on first render and a blank name there is more jarring than a stale one.
            // Settings' Profile tab, where being wrong actually matters, waits for the server.
            name: displayName,
            initials: displayName === "" ? "" : getInitials(displayName),
            avatarUrl: profile?.avatarUrl ?? null,
            // Defaults to the owner label while `profile` is still loading — there's no locally
            // stored role to read optimistically the way `displayName` has one, and the
            // overwhelming majority of sessions are owners. Corrects itself the moment
            // `GET /v1/auth/me` answers, same "briefly wrong, then right" trade-off `displayName`
            // already makes above. Before invited teammates existed, every tenant user actually
            // was an owner, so this hardcoded label was never wrong in practice.
            roleLabel: profile?.role === "member" ? t("accountMemberRole") : t("accountOwnerRole"),
          }}
        >
          {children}
        </AppShell>
      </ConnectionGuard>
    </RequireAuth>
  );
}
