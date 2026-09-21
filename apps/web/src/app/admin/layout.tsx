"use client";

import { useTranslations } from "next-intl";

import { AppShell } from "@/app/(dashboard)/_components/app-shell";
import { ROUTES } from "@/app/_libs/constants/routes";
import { platformAdminDisplayName } from "@/app/_libs/utils/admin-identity";
import { getInitials } from "@/app/_libs/utils/initials";
import { AdminGuard } from "@/app/admin/_components/admin-guard";
import { ADMIN_NAV_ITEMS } from "@/app/admin/_components/admin-nav-items";
import { usePlatformAdminProfile } from "@/hooks/admin/use-platform-admin-profile";

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
  // Same profile Settings' own Profile tab reads, through the same react-query cache — so the
  // sidebar and Settings can never disagree about who is signed in. Until it resolves the chrome
  // paints with an empty name rather than a placeholder identity: there is no stored optimistic
  // copy for an admin the way `TokenService` keeps one for a tenant owner.
  const { profile } = usePlatformAdminProfile();
  const displayName = profile ? platformAdminDisplayName(profile.email) : "";

  return (
    <AdminGuard>
      <AppShell
        navItems={ADMIN_NAV_ITEMS}
        navNamespace="adminNav"
        homeHref={ROUTES.ADMIN}
        profileHref={`${ROUTES.ADMIN_SETTINGS}?tab=profile`}
        showNotifications={false}
        showBusinessSwitcher={false}
        identity={{
          name: displayName,
          initials: displayName === "" ? "" : getInitials(displayName),
          avatarUrl: profile?.avatarUrl ?? null,
          roleLabel: t("superAdminRole"),
        }}
      >
        {children}
      </AppShell>
    </AdminGuard>
  );
}
